import { AI_CHECK_CONTRACT } from "../shared/ai-check-contract";
import { AI_CHECK_SESSION_MAX_SECONDS, AI_COOLDOWN_POLICIES, STRICTNESS_UNLOCK_CAP_MINUTES } from "../shared/constants";
import type {
  AICheckCaseInput,
  AICheckMessage,
  AICheckRoundSnapshot,
  PatternMemory,
  ProviderId,
  StrictnessLevel
} from "../shared/types";
import { buildStaticContractPrompt, dynamicPromptPart, staticPromptPart } from "./prompt";
import type { PromptPart } from "./prompt";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICheckTurnState {
  assistantTurnCount: number;
  nextAssistantTurn: number;
  maxAssistantTurns: number;
  isFinalTurn: boolean;
}

export function buildLlmMessages(input: {
  strictness: StrictnessLevel;
  targetDisplay: string;
  messages: AICheckMessage[];
  patternMemories: PatternMemory[];
  assistantTurnCount: number;
  maxAssistantTurns: number;
  isFinalTurn: boolean;
}): ChatMessage[] {
  const round = buildRoundSnapshot({
    sessionId: "legacy_session",
    targetId: "legacy_target",
    targetDisplay: input.targetDisplay,
    strictness: input.strictness,
    maxAssistantTurns: input.maxAssistantTurns,
    patternMemorySnapshot: input.patternMemories
  });
  const nextAssistantTurn = input.assistantTurnCount + 1;
  return buildProviderMessages({
    round,
    messages: input.messages,
    turn: {
      assistantTurnCount: input.assistantTurnCount,
      nextAssistantTurn,
      maxAssistantTurns: input.maxAssistantTurns,
      isFinalTurn: input.isFinalTurn
    }
  });
}

export function buildRoundSnapshot(input: {
  sessionId: string;
  targetId: string;
  targetDisplay: string;
  strictness: StrictnessLevel;
  maxAssistantTurns: number;
  patternMemorySnapshot: PatternMemory[];
  provider?: {
    id: ProviderId;
    model: string;
  };
  createdAt?: string;
}): AICheckRoundSnapshot {
  return {
    sessionId: input.sessionId,
    targetId: input.targetId,
    targetDisplay: input.targetDisplay,
    strictness: input.strictness,
    maxAssistantTurns: input.maxAssistantTurns,
    maxSessionSeconds: AI_CHECK_SESSION_MAX_SECONDS,
    aiCooldownPolicy: AI_COOLDOWN_POLICIES[input.strictness],
    unlockCapMinutes: STRICTNESS_UNLOCK_CAP_MINUTES[input.strictness],
    patternMemorySnapshot: input.patternMemorySnapshot.slice(0, 5),
    versions: {
      promptVersion: AI_CHECK_CONTRACT.promptVersion,
      schemaVersion: AI_CHECK_CONTRACT.schemaVersion,
      rubricVersion: AI_CHECK_CONTRACT.rubricVersion
    },
    provider: input.provider,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function buildRoundSnapshotFromCaseInput(
  input: AICheckCaseInput,
  options: { sessionId?: string; targetId?: string } = {}
): AICheckRoundSnapshot {
  return buildRoundSnapshot({
    sessionId: options.sessionId ?? "eval_session",
    targetId: options.targetId ?? "eval_target",
    targetDisplay: input.targetDisplay,
    strictness: input.strictness,
    maxAssistantTurns: input.sessionContext.maxAssistantTurns,
    patternMemorySnapshot: input.patternMemorySnapshot.map((memory, index) => ({
      id: memory.id ?? `eval_memory_${index}`,
      targetDisplay: memory.targetDisplay,
      behaviorReasonCategory: memory.behaviorReasonCategory,
      repeatedCount: memory.repeatedCount,
      lastUserReason: memory.lastUserReason,
      guidance: memory.guidance,
      updatedAt: memory.updatedAt
    }))
  });
}

export function buildTurnStateFromCaseInput(input: AICheckCaseInput): AICheckTurnState {
  return {
    assistantTurnCount: input.sessionContext.assistantTurnCount,
    nextAssistantTurn: input.sessionContext.assistantTurnCount + 1,
    maxAssistantTurns: input.sessionContext.maxAssistantTurns,
    isFinalTurn: input.sessionContext.isFinalTurn
  };
}

export function buildProviderMessages(input: {
  round: AICheckRoundSnapshot;
  messages: Array<Pick<AICheckMessage, "role" | "content">>;
  turn: AICheckTurnState;
}): ChatMessage[] {
  return [
    { role: "system", content: buildStaticContractPrompt() },
    { role: "user", content: buildTrustedRoundContext(input.round) },
    ...input.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: buildTrustedTurnContext(input.turn) }
  ];
}

export function buildTrustedRoundContextParts(round: AICheckRoundSnapshot): PromptPart[] {
  const memoryLines = formatPatternMemory(round.patternMemorySnapshot);

  return [
    staticPromptPart("<trusted_round_context>"),
    staticPromptPart("This context is supplied by BetterMe, not by the end user."),
    dynamicPromptPart({
      text: `Round id: ${round.sessionId}`,
      sourcePaths: ["AICheckSession.roundSnapshot.sessionId"],
      value: round.sessionId,
      meaning: "Identifies the current AI Check round for traceability."
    }),
    dynamicPromptPart({
      text: `Target: ${round.targetDisplay}`,
      sourcePaths: ["AICheckSession.roundSnapshot.targetDisplay"],
      value: round.targetDisplay,
      meaning: "Anchors the decision to the blocked target for this round."
    }),
    dynamicPromptPart({
      text: `Strictness snapshot: ${round.strictness}`,
      sourcePaths: ["AICheckSession.roundSnapshot.strictness"],
      value: round.strictness,
      meaning: "Freezes strictness for this round even if Settings changes mid-round."
    }),
    dynamicPromptPart({
      text: `Max assistant turns: ${round.maxAssistantTurns}`,
      sourcePaths: ["AICheckSession.roundSnapshot.maxAssistantTurns"],
      value: round.maxAssistantTurns,
      meaning: "Defines the maximum assistant decision opportunities for this round."
    }),
    dynamicPromptPart({
      text: `AI_COOLDOWN range: ${round.aiCooldownPolicy.minSeconds}-${round.aiCooldownPolicy.maxSeconds} seconds. Recommended default: ${round.aiCooldownPolicy.defaultSeconds} seconds.`,
      sourcePaths: ["AICheckSession.roundSnapshot.aiCooldownPolicy"],
      value: round.aiCooldownPolicy,
      meaning: "Freezes strictness-derived cooldown policy for this round."
    }),
    dynamicPromptPart({
      text: `Unlock cap: ${round.unlockCapMinutes} minutes.`,
      sourcePaths: ["AICheckSession.roundSnapshot.unlockCapMinutes"],
      value: round.unlockCapMinutes,
      meaning: "Freezes strictness-derived temporary unlock cap for this round."
    }),
    dynamicPromptPart({
      text: memoryLines ? `Relevant pattern memory:\n${memoryLines}` : "Relevant pattern memory: none yet.",
      sourcePaths: ["AICheckSession.roundSnapshot.patternMemorySnapshot"],
      value: round.patternMemorySnapshot,
      meaning: "Freezes local pattern memory at round start for reproducible decisions."
    }),
    dynamicPromptPart({
      text: `Contract versions: prompt=${round.versions.promptVersion}; schema=${round.versions.schemaVersion}; rubric=${round.versions.rubricVersion}.`,
      sourcePaths: ["AICheckSession.roundSnapshot.versions"],
      value: round.versions,
      meaning: "Records the contract versions used for this round."
    }),
    staticPromptPart("</trusted_round_context>")
  ];
}

export function buildTrustedRoundContext(round: AICheckRoundSnapshot): string {
  return buildTrustedRoundContextParts(round)
    .map((part) => part.text)
    .join("\n");
}

export function buildTrustedTurnContextParts(turn: AICheckTurnState): PromptPart[] {
  return [
    staticPromptPart("<trusted_turn_context>"),
    staticPromptPart("This context is supplied by BetterMe, not by the end user."),
    dynamicPromptPart({
      text: `Assistant turn for this response: ${turn.nextAssistantTurn}/${turn.maxAssistantTurns}.`,
      sourcePaths: ["AICheckTurnState.nextAssistantTurn", "AICheckTurnState.maxAssistantTurns"],
      value: {
        assistantTurnCount: turn.assistantTurnCount,
        nextAssistantTurn: turn.nextAssistantTurn,
        maxAssistantTurns: turn.maxAssistantTurns
      },
      meaning: "Shows the current assistant decision opportunity inside the round."
    }),
    dynamicPromptPart({
      text: turn.isFinalTurn
        ? "This is the final turn. You must return ALLOW, AI_COOLDOWN, or BLOCK. Do not return ASK_MORE."
        : "ASK_MORE is allowed only if another question is necessary inside the bounded AI Check round.",
      sourcePaths: ["AICheckTurnState.isFinalTurn"],
      value: turn.isFinalTurn,
      meaning: "Keeps final-turn enforcement as late turn-level context so stable prompt prefixes remain cacheable."
    }),
    staticPromptPart("</trusted_turn_context>")
  ];
}

export function buildTrustedTurnContext(turn: AICheckTurnState): string {
  return buildTrustedTurnContextParts(turn)
    .map((part) => part.text)
    .join("\n");
}

function formatPatternMemory(patternMemories: PatternMemory[]): string {
  return patternMemories
    .slice(0, 5)
    .map((memory) => `- ${memory.behaviorReasonCategory}: ${memory.guidance} Last reason: "${memory.lastUserReason}"`)
    .join("\n");
}
