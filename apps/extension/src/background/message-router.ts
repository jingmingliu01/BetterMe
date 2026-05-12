import type { BootstrapState, ExtensionMessage, ExtensionResult, PageAccessInfo, ProviderId } from "../shared/types";
import { createBlockedTarget } from "../blocking/target-parser";
import { createTemporaryUnlock } from "../blocking/unlocks";
import { ACCESS_TIMING, PROVIDERS } from "../shared/constants";
import { findMatchingTarget } from "../blocking/match-rules";
import { getActiveUnlockForTarget } from "../blocking/access-state";
import {
  addBlockedTarget,
  addCooldown,
  addUnlock,
  completeCooldown,
  deleteBlockedTarget,
  deleteAccessStateForTarget,
  getBlockedTargets,
  getCooldowns,
  getHolds,
  getLatestTargetAttempt,
  getSettings,
  getTargetAttempts,
  getUnlocks,
  saveSettings,
  updateSettings
} from "../storage/domain-store";
import { clearBetterMeLocalData } from "../storage/local-store";
import { clearAllIndexedDbStores } from "../storage/indexed-db";
import { deleteApiKey, hasApiKey, saveEncryptedApiKey } from "../storage/crypto-key-store";
import { rebuildDnrRules } from "./dnr-rules";
import { scheduleNextAccessStateAlarm } from "./alarms";
import { getTrackBundle, listRecentTracks, sendAITrackMessage, startAITrack } from "../ai/track-service";
import { createBadCaseReview, createEvalCaseFromBadCase, listBadCaseReviews, listEvalCases } from "../ai/review-service";
import { createBasicCooldown, createUnlockFromCompletedCooldown } from "../blocking/cooldowns";

async function providerStatus(): Promise<Record<ProviderId, boolean>> {
  const entries = await Promise.all(PROVIDERS.map(async (provider) => [provider.id, await hasApiKey(provider.id)]));
  return Object.fromEntries(entries) as Record<ProviderId, boolean>;
}

async function bootstrap(): Promise<BootstrapState> {
  const [settings, blockedTargets, unlocks, cooldowns, holds, targetAttempts, providerKeys] = await Promise.all([
    getSettings(),
    getBlockedTargets(),
    getUnlocks(),
    getCooldowns(),
    getHolds(),
    getTargetAttempts(),
    providerStatus()
  ]);
  return { settings, blockedTargets, unlocks, cooldowns, holds, targetAttempts, providerKeys };
}

export async function routeMessage(message: ExtensionMessage): Promise<ExtensionResult<unknown>> {
  try {
    switch (message.type) {
      case "bootstrap/getState":
        return ok(await bootstrap());
      case "blockedTargets/add": {
        const target = createBlockedTarget(message.payload.input, message.payload.targetType);
        const targets = await addBlockedTarget(target);
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(targets);
      }
      case "blockedTargets/delete": {
        const targets = await deleteBlockedTarget(message.payload.id);
        await deleteAccessStateForTarget(message.payload.id);
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(targets);
      }
      case "blockedTargets/list":
        return ok(await getBlockedTargets());
      case "blocking/getPageAccess":
        return ok(await getPageAccess(message.payload.url));
      case "blocking/startCooldown": {
        const target = (await getBlockedTargets()).find((item) => item.id === message.payload.targetId);
        if (!target) throw new Error("Target not found.");
        const latestAttempt = await getLatestTargetAttempt(target.id);
        await addCooldown(
          createBasicCooldown({
            targetId: target.id,
            targetDisplay: target.display,
            attemptUrl: latestAttempt?.attemptUrl ?? null
          })
        );
        await scheduleNextAccessStateAlarm();
        return ok(await bootstrap());
      }
      case "blocking/completeCooldown": {
        const cooldown = (await getCooldowns()).find((item) => item.id === message.payload.cooldownId);
        if (!cooldown) throw new Error("Cooldown not found.");
        const unlock = createUnlockFromCompletedCooldown(cooldown);
        await addUnlock(unlock);
        await completeCooldown(cooldown.id, new Date().toISOString());
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok({ ...(await bootstrap()), unlock, attemptUrl: cooldown.attemptUrl });
      }
      case "settings/update": {
        const settings = await updateSettings(message.payload);
        return ok(settings);
      }
      case "license/devUnlock": {
        const settings = await getSettings();
        const next = {
          ...settings,
          license: { status: "lifetime_mock" as const, deviceLabel: "Local demo device", lastCheckedAt: new Date().toISOString() }
        };
        await saveSettings(next);
        return ok(next);
      }
      case "license/reset": {
        const settings = await getSettings();
        const next = { ...settings, license: { status: "free" as const } };
        await saveSettings(next);
        return ok(next);
      }
      case "provider/saveApiKey": {
        await saveEncryptedApiKey(message.payload.provider, message.payload.apiKey);
        return ok(await providerStatus());
      }
      case "provider/deleteApiKey": {
        await deleteApiKey(message.payload.provider);
        return ok(await providerStatus());
      }
      case "provider/status":
        return ok(await providerStatus());
      case "ai/startTrack": {
        const settings = await getSettings();
        if (settings.license.status !== "lifetime_mock") {
          throw new Error("AI Check requires Lifetime License in this MVP.");
        }
        const target = (await getBlockedTargets()).find((item) => item.id === message.payload.targetId);
        if (!target) throw new Error("Target not found.");
        return ok(await startAITrack(target));
      }
      case "ai/sendMessage": {
        const settings = await getSettings();
        const result = await sendAITrackMessage({
          trackId: message.payload.trackId,
          content: message.payload.content,
          settings
        });
        await rebuildDnrRules();
        await scheduleNextAccessStateAlarm();
        return ok(result);
      }
      case "ai/getTrack":
        return ok(await getTrackBundle(message.payload.trackId));
      case "ai/recentTracks":
        return ok(await listRecentTracks());
      case "review/list":
        return ok(await listBadCaseReviews());
      case "review/create":
        return ok(await createBadCaseReview(message.payload));
      case "eval/createFromBadCase":
        return ok(await createEvalCaseFromBadCase(message.payload.badCaseId));
      case "eval/list":
        return ok(await listEvalCases());
      case "data/export":
        return ok({
          ...(await bootstrap()),
          tracks: await listRecentTracks(),
          reviews: await listBadCaseReviews(),
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

function ok<T>(data: T): ExtensionResult<T> {
  return { ok: true, data };
}

function fail(error: string): ExtensionResult<never> {
  return { ok: false, error };
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
