import { createId, nowIso } from "../shared/id";
import type {
  AICheckCaseInput,
  AICheckCaseOutput,
  AICheckDecisionPointSnapshot,
  AICheckMessage,
  AICheckRoundSnapshot,
  AICheckSession,
  CheckpointDecision
} from "../shared/types";

export function buildRuntimeDecisionPointSnapshot(input: {
  session: AICheckSession;
  roundSnapshot: AICheckRoundSnapshot;
  visibleMessages: AICheckMessage[];
  decision: CheckpointDecision;
  userMessage: AICheckMessage;
  assistantMessage: AICheckMessage;
  nextAssistantTurn: number;
  isFinalTurn: boolean;
}): AICheckDecisionPointSnapshot {
  const assistantTurnCountBeforeDecision = Math.max(0, input.nextAssistantTurn - 1);
  return {
    id: createId("decisionpoint"),
    sessionId: input.session.id,
    decisionId: input.decision.id,
    triggeringUserMessageId: input.userMessage.id,
    selectedAssistantMessageId: input.assistantMessage.id,
    nextAssistantTurn: input.nextAssistantTurn,
    assistantTurnCountBeforeDecision,
    maxAssistantTurns: input.roundSnapshot.maxAssistantTurns,
    isFinalTurn: input.isFinalTurn,
    roundSnapshot: input.roundSnapshot,
    input: buildCaseInput({
      session: input.session,
      roundSnapshot: input.roundSnapshot,
      visibleMessages: input.visibleMessages,
      assistantTurnCountBeforeDecision,
      isFinalTurn: input.isFinalTurn
    }),
    actualOutput: buildCapturedOutput(input.roundSnapshot, input.decision),
    createdAt: nowIso()
  };
}

export function deriveDecisionPointSnapshotFromHistory(input: {
  session: AICheckSession;
  messages: AICheckMessage[];
  decisions: CheckpointDecision[];
  decision: CheckpointDecision | null;
}): {
  decisionOrdinal?: number;
  selectedAssistantMessageId?: string | null;
  triggeringUserMessageId?: string | null;
  messages: AICheckMessage[];
  input: AICheckCaseInput;
  actualOutput?: AICheckCaseOutput;
} {
  const sortedMessages = [...input.messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const sortedDecisions = [...input.decisions].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const decisionOrdinal = input.decision ? sortedDecisions.findIndex((item) => item.id === input.decision?.id) + 1 : undefined;
  const llmAssistantMessages = sortedMessages.filter((message) => message.role === "assistant" && message.source === "llm");
  const selectedAssistant =
    decisionOrdinal && decisionOrdinal > 0 ? llmAssistantMessages[decisionOrdinal - 1] ?? null : null;
  const visibleMessages = selectedAssistant
    ? sortedMessages.filter((message) => message.createdAt < selectedAssistant.createdAt)
    : sortedMessages;
  const triggeringUser = [...visibleMessages].reverse().find((message) => message.role === "user") ?? null;
  const assistantTurnCountBeforeDecision = Math.max(0, (decisionOrdinal ?? input.session.assistantTurnCount) - 1);
  const roundSnapshot = input.session.roundSnapshot;
  const maxAssistantTurns = roundSnapshot?.maxAssistantTurns ?? input.session.maxAssistantTurns;
  const isFinalTurn = assistantTurnCountBeforeDecision + 1 >= maxAssistantTurns;

  return {
    decisionOrdinal,
    selectedAssistantMessageId: selectedAssistant?.id ?? null,
    triggeringUserMessageId: triggeringUser?.id ?? null,
    messages: visibleMessages,
    input: buildCaseInput({
      session: input.session,
      roundSnapshot,
      visibleMessages,
      assistantTurnCountBeforeDecision,
      isFinalTurn
    }),
    actualOutput: input.decision && roundSnapshot ? buildCapturedOutput(roundSnapshot, input.decision) : undefined
  };
}

export function buildCapturedOutput(
  roundSnapshot: AICheckRoundSnapshot | undefined,
  decision: CheckpointDecision
): AICheckCaseOutput {
  return {
    provider: roundSnapshot?.provider?.id,
    model: roundSnapshot?.provider?.model,
    rawProvider: decision.rawProvider,
    parsed: {
      decision: decision.decision,
      userFacingMessage: decision.userFacingMessage,
      decisionReasonCategory: decision.decisionReasonCategory,
      unlockMinutes: decision.unlockMinutes,
      aiCooldownSeconds: decision.aiCooldownSeconds,
      ...(decision.aiCooldownNormalization ? { aiCooldownNormalization: decision.aiCooldownNormalization } : {}),
      scores: decision.scores,
      memoryUpdate: decision.memoryUpdate
    }
  };
}

function buildCaseInput(input: {
  session: AICheckSession;
  roundSnapshot?: AICheckRoundSnapshot;
  visibleMessages: AICheckMessage[];
  assistantTurnCountBeforeDecision: number;
  isFinalTurn: boolean;
}): AICheckCaseInput {
  const roundSnapshot = input.roundSnapshot;
  return {
    targetDisplay: input.session.targetDisplay,
    strictness: roundSnapshot?.strictness ?? input.session.strictness ?? "balanced",
    sessionContext: {
      assistantTurnCount: input.assistantTurnCountBeforeDecision,
      maxAssistantTurns: roundSnapshot?.maxAssistantTurns ?? input.session.maxAssistantTurns,
      isFinalTurn: input.isFinalTurn
    },
    messages: input.visibleMessages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
        source: message.source
      })),
    patternMemorySnapshot: (roundSnapshot?.patternMemorySnapshot ?? []).map((memory) => ({
      id: memory.id,
      targetDisplay: memory.targetDisplay,
      behaviorReasonCategory: memory.behaviorReasonCategory,
      repeatedCount: memory.repeatedCount,
      lastUserReason: memory.lastUserReason,
      guidance: memory.guidance,
      updatedAt: memory.updatedAt
    }))
  };
}
