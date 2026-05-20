import type { AICheckMessage, PatternMemory, StrictnessLevel } from "../shared/types";
import { buildSystemPrompt } from "./prompt";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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
  const memoryLines = input.patternMemories
    .slice(0, 5)
    .map((memory) => `- ${memory.behaviorReasonCategory}: ${memory.guidance} Last reason: "${memory.lastUserReason}"`)
    .join("\n");

  const system = [
    buildSystemPrompt({
      strictness: input.strictness,
      assistantTurnCount: input.assistantTurnCount,
      maxAssistantTurns: input.maxAssistantTurns,
      isFinalTurn: input.isFinalTurn
    }),
    `Current target: ${input.targetDisplay}`,
    memoryLines ? `Relevant pattern memory:\n${memoryLines}` : "Relevant pattern memory: none yet."
  ].join("\n\n");

  return [
    { role: "system", content: system },
    ...input.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }))
  ];
}
