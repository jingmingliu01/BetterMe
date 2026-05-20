import type {
  BootstrapState,
  ExtensionMessage,
  ExtensionResult,
  PageAccessInfo,
  ProviderId,
  ProviderKeyRevision
} from "../shared/types";
import { createBlockedTarget } from "../blocking/target-parser";
import { ACCESS_TIMING, BASIC_COOLDOWN_POLICIES, getEscalatedStrictness, PROVIDERS, STORAGE_KEYS } from "../shared/constants";
import { findMatchingTarget } from "../blocking/match-rules";
import { getActiveHoldForTarget, getActiveUnlockForTarget } from "../blocking/access-state";
import {
  addBlockedTarget,
  addCooldown,
  addUnlock,
  completeCooldown,
  deleteBlockedTarget,
  getBlockedTargets,
  getCooldowns,
  getCooldownEscalations,
  getHolds,
  getLatestTargetAttempt,
  getSettings,
  getTargetAttempts,
  getUnlocks,
  recordCooldownAttempt,
  updateSettings
} from "../storage/domain-store";
import {
  appendBehaviorEvent,
  buildAttemptPayload,
  listBehaviorEvents,
  listBehaviorEventsForTargetKey,
  wasTargetPreviouslyRemoved
} from "../storage/behavior-events";
import { clearBetterMeLocalData, setLocalValue } from "../storage/local-store";
import { clearAllIndexedDbStores } from "../storage/indexed-db";
import { deleteApiKey, hasApiKey, saveEncryptedApiKey } from "../storage/crypto-key-store";
import { rebuildDnrRules } from "./dnr-rules";
import { scheduleNextAccessStateAlarm } from "./alarms";
import {
  getAICheckSessionBundle,
  getLatestBlockedAICheckSessionForTarget,
  listRecentAICheckSessions,
  sendAICheckMessage,
  startAndSendAICheckMessage
} from "../ai/ai-check-session-service";
import {
  convertBadCaseToEvalCase,
  createBadCaseReview,
  listEvalCases,
  listReviewSessions,
  updateBadCaseReview
} from "../ai/review-store";
import { createBasicCooldown, createUnlockFromCompletedCooldown } from "../blocking/cooldowns";
import { getTargetKey } from "../blocking/target-parser";

async function providerStatus(): Promise<Record<ProviderId, boolean>> {
  const entries = await Promise.all(PROVIDERS.map(async (provider) => [provider.id, await hasApiKey(provider.id)]));
  return Object.fromEntries(entries) as Record<ProviderId, boolean>;
}

async function bootstrap(): Promise<BootstrapState> {
  const [
    settings,
    blockedTargets,
    unlocks,
    cooldowns,
    cooldownEscalations,
    holds,
    targetAttempts,
    providerKeys,
    behaviorEvents
  ] = await Promise.all([
    getSettings(),
    getBlockedTargets(),
    getUnlocks(),
    getCooldowns(),
    getCooldownEscalations(),
    getHolds(),
    getTargetAttempts(),
    providerStatus(),
    listBehaviorEvents()
  ]);
  return {
    settings,
    blockedTargets,
    unlocks,
    cooldowns,
    cooldownEscalations,
    holds,
    targetAttempts,
    providerKeys,
    behaviorEvents
  };
}

export async function routeMessage(message: ExtensionMessage): Promise<ExtensionResult<unknown>> {
  try {
    switch (message.type) {
      case "bootstrap/getState":
        return ok(await bootstrap());
      case "blockedTargets/add": {
        const target = createBlockedTarget(message.payload.input, message.payload.targetType);
        const readded = await wasTargetPreviouslyRemoved(getTargetKey(target));
        const targets = await addBlockedTarget(target);
        await appendBehaviorEvent({
          type: readded ? "blocked_target_readded" : "blocked_target_added",
          target,
          payload: {
            source: target.source,
            category: target.category
          }
        });
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(targets);
      }
      case "blockedTargets/delete": {
        const target = (await getBlockedTargets()).find((item) => item.id === message.payload.id);
        if (!target) throw new Error("Target not found.");
        const recentEvents = await listBehaviorEventsForTargetKey(getTargetKey(target));
        const targets = await deleteBlockedTarget(message.payload.id);
        await appendBehaviorEvent({
          type: "blocked_target_removed",
          target,
          payload: {
            confirmationElapsedMs: message.payload.confirmationElapsedMs ?? null,
            confirmationPhraseAccepted: message.payload.confirmationPhraseAccepted ?? false,
            recent: summarizeRecentEvents(recentEvents)
          }
        });
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(targets);
      }
      case "behavior/logEvent": {
        const target = message.payload.targetId
          ? (await getBlockedTargets()).find((item) => item.id === message.payload.targetId) ?? null
          : null;
        await appendBehaviorEvent({
          type: message.payload.eventType,
          target,
          payload: message.payload.payload
        });
        return ok(true);
      }
      case "blockedTargets/list":
        return ok(await getBlockedTargets());
      case "blocking/getPageAccess":
        return ok(await getPageAccess(message.payload.url));
      case "blocking/startCooldown": {
        const target = (await getBlockedTargets()).find((item) => item.id === message.payload.targetId);
        if (!target) throw new Error("Target not found.");
        const now = new Date();
        const [latestAttempt, settings, holds] = await Promise.all([getLatestTargetAttempt(target.id), getSettings(), getHolds()]);
        if (getActiveHoldForTarget(target.id, holds, now)) {
          throw new Error("This target is held until tomorrow. Basic Cooldown is unavailable.");
        }
        const escalation = await recordCooldownAttempt(target.id, now);
        const effectiveStrictness = getEscalatedStrictness(settings.strictness, escalation.count);
        const policy = BASIC_COOLDOWN_POLICIES[effectiveStrictness];
        const cooldown = createBasicCooldown({
          targetId: target.id,
          targetDisplay: target.display,
          attemptUrl: latestAttempt?.attemptUrl ?? null,
          now,
          seconds: policy.cooldownSeconds,
          unlockSeconds: policy.unlockSeconds,
          claimWindowSeconds: policy.claimWindowSeconds,
          strictness: effectiveStrictness,
          attemptCount: escalation.count
        });
        await addCooldown(cooldown);
        await appendBehaviorEvent({
          type: "cooldown_started",
          target,
          payload: {
            cooldownId: cooldown.id,
            baseStrictness: settings.strictness,
            effectiveStrictness,
            attemptCountInWindow: escalation.count,
            cooldownSeconds: policy.cooldownSeconds,
            unlockSeconds: policy.unlockSeconds,
            claimWindowSeconds: policy.claimWindowSeconds,
            attempt: latestAttempt ? buildAttemptPayload(latestAttempt.attemptUrl) : null
          }
        });
        await scheduleNextAccessStateAlarm();
        return ok(await bootstrap());
      }
      case "blocking/completeCooldown": {
        const cooldown = (await getCooldowns()).find((item) => item.id === message.payload.cooldownId);
        if (!cooldown) throw new Error("Cooldown not found.");
        const target = (await getBlockedTargets()).find((item) => item.id === cooldown.targetId) ?? null;
        const now = new Date();
        if (getActiveHoldForTarget(cooldown.targetId, await getHolds(), now)) {
          throw new Error("This target is held until tomorrow. Basic Cooldown cannot create access.");
        }
        const completedAt = new Date().toISOString();
        const unlock = createUnlockFromCompletedCooldown(cooldown);
        await addUnlock(unlock);
        await completeCooldown(cooldown.id, completedAt);
        await appendBehaviorEvent({
          type: "cooldown_continued",
          target,
          targetId: cooldown.targetId,
          targetDisplay: cooldown.targetDisplay,
          payload: {
            cooldownId: cooldown.id,
            startedAt: cooldown.createdAt,
            endedAt: cooldown.endsAt,
            continuedAt: completedAt,
            waitedSeconds: secondsBetween(cooldown.createdAt, completedAt),
            claimWaitSeconds: secondsBetween(cooldown.endsAt, completedAt),
            unlockSeconds: Math.round(cooldown.unlockMinutes * 60),
            effectiveStrictness: cooldown.strictness ?? null,
            attemptCountInWindow: cooldown.attemptCount ?? null,
            attempt: cooldown.attemptUrl ? buildAttemptPayload(cooldown.attemptUrl) : null
          }
        });
        await appendBehaviorEvent({
          type: "temporary_unlock_created",
          target,
          targetId: cooldown.targetId,
          targetDisplay: cooldown.targetDisplay,
          payload: {
            unlockId: unlock.id,
            source: unlock.source,
            expiresAt: unlock.expiresAt,
            unlockSeconds: Math.round(cooldown.unlockMinutes * 60)
          }
        });
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok({ ...(await bootstrap()), unlock, attemptUrl: cooldown.attemptUrl });
      }
      case "settings/update": {
        const previous = await getSettings();
        const settings = await updateSettings(message.payload);
        if (message.payload.strictness && message.payload.strictness !== previous.strictness) {
          await appendBehaviorEvent({
            type: "strictness_changed",
            payload: {
              from: previous.strictness,
              to: message.payload.strictness
            }
          });
        }
        return ok(settings);
      }
      case "provider/saveApiKey": {
        await saveEncryptedApiKey(message.payload.provider, message.payload.apiKey);
        await publishProviderKeyRevision(message.payload.provider, "saved");
        return ok(await providerStatus());
      }
      case "provider/deleteApiKey": {
        await deleteApiKey(message.payload.provider);
        await publishProviderKeyRevision(message.payload.provider, "deleted");
        return ok(await providerStatus());
      }
      case "provider/status":
        return ok(await providerStatus());
      case "ai/sendMessage": {
        const settings = await getSettings();
        const bundle = await getAICheckSessionBundle(message.payload.sessionId);
        if (getActiveHoldForTarget(bundle.session.targetId, await getHolds(), new Date())) {
          throw new Error("This target is held until tomorrow. AI Check is closed for today.");
        }
        const result = await sendAICheckMessage({
          sessionId: message.payload.sessionId,
          content: message.payload.content,
          settings
        });
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(result);
      }
      case "ai/startAndSend": {
        const settings = await getSettings();
        const target = (await getBlockedTargets()).find((item) => item.id === message.payload.targetId);
        if (!target) throw new Error("Target not found.");
        if (getActiveHoldForTarget(target.id, await getHolds(), new Date())) {
          throw new Error("This target is held until tomorrow. AI Check is closed for today.");
        }
        const result = await startAndSendAICheckMessage({
          target,
          content: message.payload.content,
          settings
        });
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(result);
      }
      case "ai/getSession":
        return ok(await getAICheckSessionBundle(message.payload.sessionId));
      case "ai/getLatestBlockedSession":
        return ok(await getLatestBlockedAICheckSessionForTarget(message.payload.targetId));
      case "ai/recentSessions":
        return ok(await listRecentAICheckSessions());
      case "review/listSessions":
        return ok(await listReviewSessions());
      case "review/createBadCase":
        return ok(await createBadCaseReview(message.payload));
      case "review/updateBadCase":
        return ok(await updateBadCaseReview(message.payload));
      case "review/convertBadCaseToEval":
        return ok(await convertBadCaseToEvalCase(message.payload));
      case "review/listEvalCases":
        return ok(await listEvalCases());
      case "data/export":
        return ok({
          ...(await bootstrap()),
          sessions: await listRecentAICheckSessions(),
          reviewSessions: await listReviewSessions(),
          evalCases: await listEvalCases()
        });
      case "data/deleteAll":
        await clearBetterMeLocalData();
        await clearAllIndexedDbStores();
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(true);
      default:
        return fail("Unknown message type.");
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unknown error.");
  }
}

function summarizeRecentEvents(events: Awaited<ReturnType<typeof listBehaviorEventsForTargetKey>>): Record<string, number> {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = events.filter((event) => new Date(event.createdAt).getTime() >= since);
  return {
    blockedAttempts7d: recent.filter((event) => event.type === "blocked_url_attempted").length,
    cooldownStarts7d: recent.filter((event) => event.type === "cooldown_started").length,
    cooldownContinues7d: recent.filter((event) => event.type === "cooldown_continued").length,
    removals7d: recent.filter((event) => event.type === "blocked_target_removed").length,
    readds7d: recent.filter((event) => event.type === "blocked_target_readded").length
  };
}

function secondsBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

function ok<T>(data: T): ExtensionResult<T> {
  return { ok: true, data };
}

function fail(error: string): ExtensionResult<never> {
  return { ok: false, error };
}

async function publishProviderKeyRevision(provider: ProviderId, action: ProviderKeyRevision["action"]): Promise<void> {
  await setLocalValue<ProviderKeyRevision>(STORAGE_KEYS.providerKeyRevision, {
    provider,
    action,
    updatedAt: new Date().toISOString()
  });
}

async function getPageAccess(url: string): Promise<PageAccessInfo> {
  const [targets, unlocks] = await Promise.all([getBlockedTargets(), getUnlocks()]);
  const target = findMatchingTarget(url, targets);
  if (!target) {
    return {
      targetId: null,
      targetDisplay: null,
      unlockId: null,
      unlockExpiresAt: null,
      unlockWarningRemainingSeconds: ACCESS_TIMING.unlockWarningRemainingSeconds,
      shouldRedirectNow: false
    };
  }

  const activeUnlock = getActiveUnlockForTarget(target.id, unlocks);
  return {
    targetId: target.id,
    targetDisplay: target.display,
    unlockId: activeUnlock?.id ?? null,
    unlockExpiresAt: activeUnlock?.expiresAt ?? null,
    unlockWarningRemainingSeconds: ACCESS_TIMING.unlockWarningRemainingSeconds,
    shouldRedirectNow: !activeUnlock
  };
}
