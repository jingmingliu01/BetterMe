import { createId, nowIso } from "../shared/id";
import { STRICTNESS_UNLOCK_CAP_MINUTES } from "../shared/constants";
import type { AIDecision, CheckpointDecision, StrictnessLevel } from "../shared/types";

const DECISIONS: AIDecision[] = ["ALLOW", "AI_COOLDOWN", "ASK_MORE", "BLOCK"];
const LEGACY_DECISION_MAP: Record<string, AIDecision> = {
  DELAY: "AI_COOLDOWN"
};
const REASONING_CATEGORIES: CheckpointDecision["reasoningCategory"][] = [
  "repeated_excuse",
  "clear_intention",
  "high_risk_pattern",
  "low_risk",
  "insufficient_reason"
];
const MEMORY_REASON_CATEGORIES: CheckpointDecision["memoryUpdate"]["reasonCategory"][] = [
  "stress",
  "boredom",
  "loneliness",
  "escape",
  "habit",
  "intentional",
  "other"
];

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseCheckpointDecision(raw: string, sessionId: string): CheckpointDecision {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("LLM did not return valid JSON.");
  }

  const decision = normalizeDecision(parsed.decision);
  if (!decision) {
    throw new Error("LLM returned an invalid decision.");
  }
  if (!REASONING_CATEGORIES.includes(parsed.reasoningCategory as CheckpointDecision["reasoningCategory"])) {
    throw new Error("LLM returned an invalid reasoningCategory.");
  }

  const scores = (parsed.scores ?? {}) as Record<string, unknown>;
  const memoryUpdate = (parsed.memoryUpdate ?? {}) as Record<string, unknown>;
  if (!MEMORY_REASON_CATEGORIES.includes(memoryUpdate.reasonCategory as CheckpointDecision["memoryUpdate"]["reasonCategory"])) {
    throw new Error("LLM returned an invalid memoryUpdate.reasonCategory.");
  }

  return {
    id: createId("decision"),
    sessionId,
    decision,
    userFacingMessage: asString(parsed.userFacingMessage, "I need one more clear reason before deciding."),
    reasoningCategory: parsed.reasoningCategory as CheckpointDecision["reasoningCategory"],
    unlockMinutes: typeof parsed.unlockMinutes === "number" ? parsed.unlockMinutes : null,
    aiCooldownSeconds: getAICooldownSeconds(parsed),
    nextQuestion: asNullableString(parsed.nextQuestion),
    scores: {
      repeatedReason: asNumber(scores.repeatedReason, 0),
      impulse: asNumber(scores.impulse, 50),
      deliberateness: asNumber(scores.deliberateness, 50)
    },
    memoryUpdate: {
      reasonCategory: memoryUpdate.reasonCategory as CheckpointDecision["memoryUpdate"]["reasonCategory"],
      patternNote: asNullableString(memoryUpdate.patternNote)
    },
    createdAt: nowIso(),
    rawProvider: raw
  };
}

function normalizeDecision(value: unknown): AIDecision | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = LEGACY_DECISION_MAP[value] ?? value;
  return DECISIONS.includes(normalized as AIDecision) ? (normalized as AIDecision) : null;
}

function getAICooldownSeconds(parsed: Record<string, unknown>): number | null {
  if (typeof parsed.aiCooldownSeconds === "number") {
    return parsed.aiCooldownSeconds;
  }
  return typeof parsed.delaySeconds === "number" ? parsed.delaySeconds : null;
}

export function createFallbackDecision(sessionId: string, message: string): CheckpointDecision {
  return {
    id: createId("decision"),
    sessionId,
    decision: "ASK_MORE",
    userFacingMessage: message,
    reasoningCategory: "insufficient_reason",
    unlockMinutes: null,
    aiCooldownSeconds: null,
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

export function validateDecisionConstraints(decision: CheckpointDecision, strictness: StrictnessLevel): void {
  if (decision.decision === "ALLOW") {
    const cap = STRICTNESS_UNLOCK_CAP_MINUTES[strictness];
    if (typeof decision.unlockMinutes !== "number" || decision.unlockMinutes <= 0 || decision.unlockMinutes > cap) {
      throw new Error(`ALLOW decision requires unlockMinutes between 1 and ${cap}.`);
    }
  }

  if (decision.decision === "AI_COOLDOWN") {
    if (typeof decision.aiCooldownSeconds !== "number" || decision.aiCooldownSeconds <= 0) {
      throw new Error("AI_COOLDOWN decision requires positive aiCooldownSeconds.");
    }
  }

  if (decision.decision === "ASK_MORE") {
    if (!decision.nextQuestion?.trim()) {
      throw new Error("ASK_MORE decision requires nextQuestion.");
    }
  }
}
