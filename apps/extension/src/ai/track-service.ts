import {
  AI_TRACK_MAX_ASSISTANT_TURNS,
  AI_TRACK_MAX_SECONDS,
  STRICTNESS_UNLOCK_CAP_MINUTES
} from "../shared/constants";
import { createId, nowIso } from "../shared/id";
import type {
  AITrack,
  AITrackMessage,
  AITrackSummary,
  BlockedTarget,
  CheckpointDecision,
  UserSettings
} from "../shared/types";
import { buildLlmMessages } from "./context-builder";
import { buildOpeningMessage } from "./prompt";
import { ProviderRequestError, requestCheckpointDecision } from "./provider-client";
import { listPatternMemory, updatePatternMemory } from "./pattern-memory";
import { addHold, addUnlock } from "../storage/domain-store";
import { getAllRecords, getRecord, putRecord } from "../storage/indexed-db";
import { appendBehaviorEvent } from "../storage/behavior-events";
import { createBlockHoldUntilNextDay, createTemporaryUnlock } from "../blocking/unlocks";
import { loadDecryptedApiKey } from "../storage/crypto-key-store";
import { getTargetKey } from "../blocking/target-parser";

export async function startAITrack(target: BlockedTarget): Promise<{ track: AITrack; messages: AITrackMessage[] }> {
  const now = new Date();
  const track: AITrack = {
    id: createId("track"),
    targetId: target.id,
    targetKey: getTargetKey(target),
    targetDisplay: target.display,
    status: "active",
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AI_TRACK_MAX_SECONDS * 1000).toISOString(),
    assistantTurnCount: 0,
    maxAssistantTurns: AI_TRACK_MAX_ASSISTANT_TURNS
  };
  const opening: AITrackMessage = {
    id: createId("msg"),
    trackId: track.id,
    role: "assistant",
    source: "local_opening",
    content: buildOpeningMessage(target.display),
    createdAt: nowIso()
  };

  await putRecord("aiTracks", track);
  await putRecord("aiTrackMessages", opening);
  await appendBehaviorEvent({
    type: "ai_track_started",
    target,
    payload: {
      trackId: track.id,
      expiresAt: track.expiresAt,
      maxAssistantTurns: track.maxAssistantTurns
    }
  });
  return { track, messages: [opening] };
}

export async function startAndSendAITrackMessage(input: {
  target: BlockedTarget;
  content: string;
  settings: UserSettings;
}): Promise<{ track: AITrack; messages: AITrackMessage[]; decision: CheckpointDecision }> {
  const { track } = await startAITrack(input.target);
  return sendAITrackMessage({
    trackId: track.id,
    content: input.content,
    settings: input.settings
  });
}

export async function getTrackBundle(trackId: string): Promise<{
  track: AITrack;
  messages: AITrackMessage[];
  decisions: CheckpointDecision[];
}> {
  const track = await getRecord<AITrack>("aiTracks", trackId);
  if (!track) {
    throw new Error("Track not found.");
  }

  const [messages, decisions] = await Promise.all([
    getAllRecords<AITrackMessage>("aiTrackMessages"),
    getAllRecords<CheckpointDecision>("checkpointDecisions")
  ]);

  return {
    track,
    messages: messages
      .filter((message) => message.trackId === trackId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    decisions: decisions
      .filter((decision) => decision.trackId === trackId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  };
}

export async function sendAITrackMessage(input: {
  trackId: string;
  content: string;
  settings: UserSettings;
}): Promise<{ track: AITrack; messages: AITrackMessage[]; decision: CheckpointDecision }> {
  const bundle = await getTrackBundle(input.trackId);
  const now = Date.now();
  if (new Date(bundle.track.expiresAt).getTime() <= now) {
    const expired = { ...bundle.track, status: "expired" as const, completedAt: nowIso() };
    await putRecord("aiTracks", expired);
    throw new Error("This AI Track expired. Please leave and start a new checkpoint later.");
  }
  if (bundle.track.assistantTurnCount >= bundle.track.maxAssistantTurns) {
    throw new Error("This AI Track has reached the turn limit.");
  }

  const userMessage: AITrackMessage = {
    id: createId("msg"),
    trackId: input.trackId,
    role: "user",
    source: "user",
    content: input.content.trim(),
    createdAt: nowIso()
  };
  await putRecord("aiTrackMessages", userMessage);

  const apiKey = await loadDecryptedApiKey(input.settings.provider);
  if (!apiKey) {
    throw new Error("AI Check is locked until a provider API key is saved.");
  }

  const messages = [...bundle.messages, userMessage];
  const patternMemories = await listPatternMemory(bundle.track.targetDisplay);
  const llmMessages = buildLlmMessages({
    strictness: input.settings.strictness,
    targetDisplay: bundle.track.targetDisplay,
    messages,
    patternMemories
  });

  let decision: CheckpointDecision;
  try {
    decision = await requestCheckpointDecision({
      provider: input.settings.provider,
      model: input.settings.model,
      apiKey,
      messages: llmMessages,
      trackId: input.trackId,
      strictness: input.settings.strictness
    });
  } catch (error) {
    const failed = {
      ...bundle.track,
      status: error instanceof ProviderRequestError ? ("provider_error" as const) : ("schema_error" as const)
    };
    await putRecord("aiTracks", failed);
    throw error;
  }

  const assistantMessage: AITrackMessage = {
    id: createId("msg"),
    trackId: input.trackId,
    role: "assistant",
    source: "llm",
    content: decision.nextQuestion ?? decision.userFacingMessage,
    createdAt: nowIso()
  };

  const nextTrack = await applyDecision({
    track: bundle.track,
    decision,
    settings: input.settings,
    latestUserReason: userMessage.content
  });

  await putRecord("checkpointDecisions", decision);
  await putRecord("aiTrackMessages", assistantMessage);
  await putRecord("aiTracks", nextTrack);
  await updatePatternMemory({
    targetDisplay: bundle.track.targetDisplay,
    userReason: userMessage.content,
    decision
  });

  if (["ALLOW", "BLOCK"].includes(decision.decision)) {
    await saveTrackSummary(nextTrack, decision, userMessage.content);
  }

  return {
    track: nextTrack,
    messages: [...messages, assistantMessage],
    decision
  };
}

async function applyDecision(input: {
  track: AITrack;
  decision: CheckpointDecision;
  settings: UserSettings;
  latestUserReason: string;
}): Promise<AITrack> {
  const assistantTurnCount = input.track.assistantTurnCount + 1;
  const base = {
    ...input.track,
    assistantTurnCount,
    finalDecisionId: input.decision.id
  };

  if (input.decision.decision === "ALLOW") {
    const cap = STRICTNESS_UNLOCK_CAP_MINUTES[input.settings.strictness];
    const minutes = Math.max(1, Math.min(input.decision.unlockMinutes ?? cap, cap));
    const unlock = createTemporaryUnlock({
      targetId: input.track.targetId,
      targetDisplay: input.track.targetDisplay,
      source: "ai_allow",
      minutes
    });
    await addUnlock(unlock);
    await appendBehaviorEvent({
      type: "temporary_unlock_created",
      targetId: input.track.targetId,
      targetKey: input.track.targetKey,
      targetDisplay: input.track.targetDisplay,
      payload: {
        unlockId: unlock.id,
        source: unlock.source,
        expiresAt: unlock.expiresAt,
        unlockSeconds: Math.round(minutes * 60),
        trackId: input.track.id,
        decisionId: input.decision.id
      }
    });
    await appendBehaviorEvent({
      type: "ai_decision_applied",
      targetId: input.track.targetId,
      targetKey: input.track.targetKey,
      targetDisplay: input.track.targetDisplay,
      payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.track.id)
    });
    return {
      ...base,
      status: "allowed",
      finalDecision: "ALLOW",
      completedAt: nowIso()
    };
  }

  if (input.decision.decision === "BLOCK") {
    const hold = createBlockHoldUntilNextDay({
      targetId: input.track.targetId,
      targetDisplay: input.track.targetDisplay,
      sourceTrackId: input.track.id
    });
    await addHold(hold);
    await appendBehaviorEvent({
      type: "block_hold_created",
      targetId: input.track.targetId,
      targetKey: input.track.targetKey,
      targetDisplay: input.track.targetDisplay,
      payload: {
        holdId: hold.id,
        expiresAt: hold.expiresAt,
        trackId: input.track.id,
        decisionId: input.decision.id
      }
    });
    await appendBehaviorEvent({
      type: "ai_decision_applied",
      targetId: input.track.targetId,
      targetKey: input.track.targetKey,
      targetDisplay: input.track.targetDisplay,
      payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.track.id)
    });
    return {
      ...base,
      status: "blocked",
      finalDecision: "BLOCK",
      completedAt: nowIso()
    };
  }

  if (input.decision.decision === "DELAY") {
    await appendBehaviorEvent({
      type: "ai_decision_applied",
      targetId: input.track.targetId,
      targetKey: input.track.targetKey,
      targetDisplay: input.track.targetDisplay,
      payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.track.id)
    });
    return {
      ...base,
      status: "delayed",
      finalDecision: "DELAY"
    };
  }

  await appendBehaviorEvent({
    type: "ai_decision_applied",
    targetId: input.track.targetId,
    targetKey: input.track.targetKey,
    targetDisplay: input.track.targetDisplay,
    payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.track.id)
  });
  return {
    ...base,
    status: "active",
    finalDecision: "ASK_MORE"
  };
}

function buildDecisionEventPayload(
  decision: CheckpointDecision,
  strictness: UserSettings["strictness"],
  trackId: string
): Record<string, unknown> {
  return {
    trackId,
    decisionId: decision.id,
    decision: decision.decision,
    strictness,
    reasoningCategory: decision.reasoningCategory,
    unlockMinutes: decision.unlockMinutes,
    delaySeconds: decision.delaySeconds,
    scores: decision.scores,
    reasonCategory: decision.memoryUpdate.reasonCategory
  };
}

async function saveTrackSummary(
  track: AITrack,
  decision: CheckpointDecision,
  latestUserReason: string
): Promise<void> {
  const summary: AITrackSummary = {
    id: createId("summary"),
    trackId: track.id,
    targetDisplay: track.targetDisplay,
    finalDecision: decision.decision,
    reasonCategory: decision.memoryUpdate.reasonCategory,
    shortSummary: `User said: "${latestUserReason}". AI decided ${decision.decision} because ${decision.reasoningCategory}.`,
    createdAt: nowIso()
  };
  await putRecord("aiTrackSummaries", summary);
}

export async function listRecentTracks(): Promise<Array<AITrack & { messages: AITrackMessage[] }>> {
  const tracks = await getAllRecords<AITrack>("aiTracks");
  const messages = await getAllRecords<AITrackMessage>("aiTrackMessages");
  return tracks
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 30)
    .map((track) => ({
      ...track,
      messages: messages
        .filter((message) => message.trackId === track.id)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    }));
}
