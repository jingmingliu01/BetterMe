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
    dynamicPromptPart({
      text: `<target>\n${round.targetDisplay}\n</target>`,
      sourcePaths: ["AICheckSession.roundSnapshot.targetDisplay"],
      value: round.targetDisplay,
      meaning: "Anchors the decision to the blocked target for this round."
    }),
    dynamicPromptPart({
      text: `<strictness>\n${round.strictness}\n</strictness>`,
      sourcePaths: ["AICheckSession.roundSnapshot.strictness"],
      value: round.strictness,
      meaning: "Freezes strictness for this round even if Settings changes mid-round."
    }),
    dynamicPromptPart({
      text: `<round_limits>\nMax assistant turns: ${round.maxAssistantTurns}\nMax session seconds: ${round.maxSessionSeconds}\n</round_limits>`,
      sourcePaths: ["AICheckSession.roundSnapshot.maxAssistantTurns", "AICheckSession.roundSnapshot.maxSessionSeconds"],
      value: {
        maxAssistantTurns: round.maxAssistantTurns,
        maxSessionSeconds: round.maxSessionSeconds
      },
      meaning: "Defines the maximum assistant decision opportunities and duration for this round."
    }),
    dynamicPromptPart({
      text: `<access_policy>\nAI_COOLDOWN seconds: min=${round.aiCooldownPolicy.minSeconds}; default=${round.aiCooldownPolicy.defaultSeconds}; max=${round.aiCooldownPolicy.maxSeconds}\nUnlock cap minutes: ${round.unlockCapMinutes}\n</access_policy>`,
      sourcePaths: ["AICheckSession.roundSnapshot.aiCooldownPolicy", "AICheckSession.roundSnapshot.unlockCapMinutes"],
      value: {
        aiCooldownPolicy: round.aiCooldownPolicy,
        unlockCapMinutes: round.unlockCapMinutes
      },
      meaning: "Freezes strictness-derived cooldown and temporary unlock policy for this round."
    }),
    dynamicPromptPart({
      text: `<pattern_memory>\n${memoryLines || "none yet"}\n</pattern_memory>`,
      sourcePaths: ["AICheckSession.roundSnapshot.patternMemorySnapshot"],
      value: round.patternMemorySnapshot,
      meaning: "Freezes local pattern memory at round start for reproducible decisions."
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
    dynamicPromptPart({
      text: `<turn>\nAssistant turn for this response: ${turn.nextAssistantTurn}/${turn.maxAssistantTurns}\n</turn>`,
      sourcePaths: ["AICheckTurnState.nextAssistantTurn", "AICheckTurnState.maxAssistantTurns"],
      value: {
        assistantTurnCount: turn.assistantTurnCount,
        nextAssistantTurn: turn.nextAssistantTurn,
        maxAssistantTurns: turn.maxAssistantTurns
      },
      meaning: "Shows the current assistant decision opportunity inside the round."
    }),
    dynamicPromptPart({
      text: `<ask_more_policy>\n${
        turn.isFinalTurn
          ? "This is the final turn. You must return ALLOW, AI_COOLDOWN, or BLOCK. Do not return ASK_MORE."
          : "ASK_MORE is allowed only if another question is necessary inside the bounded AI Check round."
      }\n</ask_more_policy>`,
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
