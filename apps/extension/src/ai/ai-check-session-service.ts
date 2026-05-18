import {
  AI_CHECK_SESSION_MAX_ASSISTANT_TURNS,
  AI_CHECK_SESSION_MAX_SECONDS,
  STRICTNESS_UNLOCK_CAP_MINUTES
} from "../shared/constants";
import { createId, nowIso } from "../shared/id";
import type {
  AICheckSession,
  AICheckMessage,
  AICheckSummary,
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

export async function startAICheckSession(target: BlockedTarget): Promise<{ session: AICheckSession; messages: AICheckMessage[] }> {
  const now = new Date();
  const session: AICheckSession = {
    id: createId("session"),
    targetId: target.id,
    targetKey: getTargetKey(target),
    targetDisplay: target.display,
    status: "active",
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AI_CHECK_SESSION_MAX_SECONDS * 1000).toISOString(),
    assistantTurnCount: 0,
    maxAssistantTurns: AI_CHECK_SESSION_MAX_ASSISTANT_TURNS
  };
  const opening: AICheckMessage = {
    id: createId("msg"),
    sessionId: session.id,
    role: "assistant",
    source: "local_opening",
    content: buildOpeningMessage(target.display),
    createdAt: nowIso()
  };

  await putRecord("aiCheckSessions", session);
  await putRecord("aiCheckMessages", opening);
  await appendBehaviorEvent({
    type: "ai_check_session_started",
    target,
    payload: {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      maxAssistantTurns: session.maxAssistantTurns
    }
  });
  return { session, messages: [opening] };
}

export async function startAndSendAICheckMessage(input: {
  target: BlockedTarget;
  content: string;
  settings: UserSettings;
}): Promise<{ session: AICheckSession; messages: AICheckMessage[]; decision: CheckpointDecision }> {
  const { session } = await startAICheckSession(input.target);
  return sendAICheckMessage({
    sessionId: session.id,
    content: input.content,
    settings: input.settings
  });
}

export async function getAICheckSessionBundle(sessionId: string): Promise<{
  session: AICheckSession;
  messages: AICheckMessage[];
  decisions: CheckpointDecision[];
}> {
  const session = await getRecord<AICheckSession>("aiCheckSessions", sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const [messages, decisions] = await Promise.all([
    getAllRecords<AICheckMessage>("aiCheckMessages"),
    getAllRecords<CheckpointDecision>("checkpointDecisions")
  ]);

  return {
    session,
    messages: messages
      .filter((message) => message.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    decisions: decisions
      .filter((decision) => decision.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  };
}

export async function sendAICheckMessage(input: {
  sessionId: string;
  content: string;
  settings: UserSettings;
}): Promise<{ session: AICheckSession; messages: AICheckMessage[]; decision: CheckpointDecision }> {
  const bundle = await getAICheckSessionBundle(input.sessionId);
  const now = Date.now();
  if (new Date(bundle.session.expiresAt).getTime() <= now) {
    const expired = { ...bundle.session, status: "expired" as const, completedAt: nowIso() };
    await putRecord("aiCheckSessions", expired);
    throw new Error("This AI Check session expired. Please leave and start a new checkpoint later.");
  }
  if (bundle.session.assistantTurnCount >= bundle.session.maxAssistantTurns) {
    throw new Error("This AI Check session has reached the turn limit.");
  }

  const userMessage: AICheckMessage = {
    id: createId("msg"),
    sessionId: input.sessionId,
    role: "user",
    source: "user",
    content: input.content.trim(),
    createdAt: nowIso()
  };
  await putRecord("aiCheckMessages", userMessage);

  const apiKey = await loadDecryptedApiKey(input.settings.provider);
  if (!apiKey) {
    throw new Error("AI Check is locked until a provider API key is saved.");
  }

  const messages = [...bundle.messages, userMessage];
  const patternMemories = await listPatternMemory(bundle.session.targetDisplay);
  const llmMessages = buildLlmMessages({
    strictness: input.settings.strictness,
    targetDisplay: bundle.session.targetDisplay,
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
      sessionId: input.sessionId,
      strictness: input.settings.strictness
    });
  } catch (error) {
    const failed = {
      ...bundle.session,
      status: error instanceof ProviderRequestError ? ("provider_error" as const) : ("schema_error" as const)
    };
    await putRecord("aiCheckSessions", failed);
    throw error;
  }

  const assistantMessage: AICheckMessage = {
    id: createId("msg"),
    sessionId: input.sessionId,
    role: "assistant",
    source: "llm",
    content: decision.nextQuestion ?? decision.userFacingMessage,
    createdAt: nowIso()
  };

  const nextSession = await applyDecision({
    session: bundle.session,
    decision,
    settings: input.settings,
    latestUserReason: userMessage.content
  });

  await putRecord("checkpointDecisions", decision);
  await putRecord("aiCheckMessages", assistantMessage);
  await putRecord("aiCheckSessions", nextSession);
  await updatePatternMemory({
    targetDisplay: bundle.session.targetDisplay,
    userReason: userMessage.content,
    decision
  });

  if (["ALLOW", "BLOCK"].includes(decision.decision)) {
    await saveSessionSummary(nextSession, decision, userMessage.content);
  }

  return {
    session: nextSession,
    messages: [...messages, assistantMessage],
    decision
  };
}

async function applyDecision(input: {
  session: AICheckSession;
  decision: CheckpointDecision;
  settings: UserSettings;
  latestUserReason: string;
}): Promise<AICheckSession> {
  const assistantTurnCount = input.session.assistantTurnCount + 1;
  const base = {
    ...input.session,
    assistantTurnCount,
    finalDecisionId: input.decision.id
  };

  if (input.decision.decision === "ALLOW") {
    const cap = STRICTNESS_UNLOCK_CAP_MINUTES[input.settings.strictness];
    const minutes = Math.max(1, Math.min(input.decision.unlockMinutes ?? cap, cap));
    const unlock = createTemporaryUnlock({
      targetId: input.session.targetId,
      targetDisplay: input.session.targetDisplay,
      source: "ai_allow",
      minutes
    });
    await addUnlock(unlock);
    await appendBehaviorEvent({
      type: "temporary_unlock_created",
      targetId: input.session.targetId,
      targetKey: input.session.targetKey,
      targetDisplay: input.session.targetDisplay,
      payload: {
        unlockId: unlock.id,
        source: unlock.source,
        expiresAt: unlock.expiresAt,
        unlockSeconds: Math.round(minutes * 60),
        sessionId: input.session.id,
        decisionId: input.decision.id
      }
    });
    await appendBehaviorEvent({
      type: "ai_decision_applied",
      targetId: input.session.targetId,
      targetKey: input.session.targetKey,
      targetDisplay: input.session.targetDisplay,
      payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.session.id)
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
      targetId: input.session.targetId,
      targetDisplay: input.session.targetDisplay,
      sourceSessionId: input.session.id
    });
    await addHold(hold);
    await appendBehaviorEvent({
      type: "block_hold_created",
      targetId: input.session.targetId,
      targetKey: input.session.targetKey,
      targetDisplay: input.session.targetDisplay,
      payload: {
        holdId: hold.id,
        expiresAt: hold.expiresAt,
        sessionId: input.session.id,
        decisionId: input.decision.id
      }
    });
    await appendBehaviorEvent({
      type: "ai_decision_applied",
      targetId: input.session.targetId,
      targetKey: input.session.targetKey,
      targetDisplay: input.session.targetDisplay,
      payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.session.id)
    });
    return {
      ...base,
      status: "blocked",
      finalDecision: "BLOCK",
      completedAt: nowIso()
    };
  }

  if (input.decision.decision === "AI_COOLDOWN") {
    await appendBehaviorEvent({
      type: "ai_decision_applied",
      targetId: input.session.targetId,
      targetKey: input.session.targetKey,
      targetDisplay: input.session.targetDisplay,
      payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.session.id)
    });
    return {
      ...base,
      status: "ai_cooling_down",
      finalDecision: "AI_COOLDOWN"
    };
  }

  await appendBehaviorEvent({
    type: "ai_decision_applied",
    targetId: input.session.targetId,
    targetKey: input.session.targetKey,
    targetDisplay: input.session.targetDisplay,
    payload: buildDecisionEventPayload(input.decision, input.settings.strictness, input.session.id)
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
  sessionId: string
): Record<string, unknown> {
  return {
    sessionId,
    decisionId: decision.id,
    decision: decision.decision,
    strictness,
    reasoningCategory: decision.reasoningCategory,
    unlockMinutes: decision.unlockMinutes,
    aiCooldownSeconds: decision.aiCooldownSeconds,
    scores: decision.scores,
    reasonCategory: decision.memoryUpdate.reasonCategory
  };
}

async function saveSessionSummary(
  session: AICheckSession,
  decision: CheckpointDecision,
  latestUserReason: string
): Promise<void> {
  const summary: AICheckSummary = {
    id: createId("summary"),
    sessionId: session.id,
    targetDisplay: session.targetDisplay,
    finalDecision: decision.decision,
    reasonCategory: decision.memoryUpdate.reasonCategory,
    shortSummary: `User said: "${latestUserReason}". AI decided ${decision.decision} because ${decision.reasoningCategory}.`,
    createdAt: nowIso()
  };
  await putRecord("aiCheckSummaries", summary);
}

export async function listRecentAICheckSessions(): Promise<Array<AICheckSession & { messages: AICheckMessage[] }>> {
  const sessions = await getAllRecords<AICheckSession>("aiCheckSessions");
  const messages = await getAllRecords<AICheckMessage>("aiCheckMessages");
  return sessions
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 30)
    .map((session) => ({
      ...session,
      messages: messages
        .filter((message) => message.sessionId === session.id)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    }));
}
