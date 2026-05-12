import { createId, nowIso } from "../shared/id";
import type { AIDecision, CheckpointDecision } from "../shared/types";

const DECISIONS: AIDecision[] = ["ALLOW", "DELAY", "ASK_MORE", "BLOCK"];

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseCheckpointDecision(raw: string, trackId: string): CheckpointDecision {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("LLM did not return valid JSON.");
  }

  const decision = parsed.decision;
  if (!DECISIONS.includes(decision as AIDecision)) {
    throw new Error("LLM returned an invalid decision.");
  }

  const scores = (parsed.scores ?? {}) as Record<string, unknown>;
  const memoryUpdate = (parsed.memoryUpdate ?? {}) as Record<string, unknown>;

  return {
    id: createId("decision"),
    trackId,
    decision: decision as AIDecision,
    userFacingMessage: asString(parsed.userFacingMessage, "I need one more clear reason before deciding."),
    reasoningCategory: asString(parsed.reasoningCategory, "insufficient_reason") as CheckpointDecision["reasoningCategory"],
    unlockMinutes: typeof parsed.unlockMinutes === "number" ? parsed.unlockMinutes : null,
    delaySeconds: typeof parsed.delaySeconds === "number" ? parsed.delaySeconds : null,
    nextQuestion: asNullableString(parsed.nextQuestion),
    scores: {
      repeatedReason: asNumber(scores.repeatedReason, 0),
      impulse: asNumber(scores.impulse, 50),
      deliberateness: asNumber(scores.deliberateness, 50)
    },
    memoryUpdate: {
      reasonCategory: asString(memoryUpdate.reasonCategory, "other") as CheckpointDecision["memoryUpdate"]["reasonCategory"],
      patternNote: asNullableString(memoryUpdate.patternNote)
    },
    createdAt: nowIso(),
    rawProvider: raw
  };
}

export function createFallbackDecision(trackId: string, message: string): CheckpointDecision {
  return {
    id: createId("decision"),
    trackId,
    decision: "ASK_MORE",
    userFacingMessage: message,
    reasoningCategory: "insufficient_reason",
    unlockMinutes: null,
    delaySeconds: null,
    nextQuestion: message,
    scores: {
      repeatedReason: 0,
      impulse: 60,
      deliberateness: 35
    },
    memoryUpdate: {
      reasonCategory: "other",
      patternNote: null
    },
    createdAt: nowIso()
  };
}
