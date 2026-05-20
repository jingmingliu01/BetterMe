import { createId, nowIso } from "../shared/id";
import { normalizeAICooldownSeconds, STRICTNESS_UNLOCK_CAP_MINUTES } from "../shared/constants";
import type { AICheckScoreName, AIDecision, CheckpointDecision, StrictnessLevel } from "../shared/types";

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
  const reasoningCategory = normalizeReasoningCategory(parsed.reasoningCategory, decision);

  const scores = (parsed.scores ?? {}) as Record<string, unknown>;
  const memoryUpdate = (parsed.memoryUpdate ?? {}) as Record<string, unknown>;
  const memoryReasonCategory = normalizeMemoryReasonCategory(memoryUpdate.reasonCategory);

  return {
    id: createId("decision"),
    sessionId,
    decision,
    userFacingMessage: asString(parsed.userFacingMessage, "I need one more clear reason before deciding."),
    reasoningCategory,
    unlockMinutes: typeof parsed.unlockMinutes === "number" ? parsed.unlockMinutes : null,
    aiCooldownSeconds: getAICooldownSeconds(parsed),
    nextQuestion: asNullableString(parsed.nextQuestion),
    scores: {
      repeatedReason: readScore(scores.repeatedReason, "repeatedReason"),
      impulse: readScore(scores.impulse, "impulse"),
      deliberateness: readScore(scores.deliberateness, "deliberateness")
    },
    memoryUpdate: {
      reasonCategory: memoryReasonCategory,
      patternNote: asNullableString(memoryUpdate.patternNote)
    },
    createdAt: nowIso(),
    rawProvider: raw
  };
}

function readScore(value: unknown, name: AICheckScoreName): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`LLM returned an invalid ${name} score.`);
  }
  if (value < 0 || value > 100) {
    throw new Error(`LLM returned ${name} score outside 0-100.`);
  }
  return Math.round(value);
}

function normalizeReasoningCategory(
  value: unknown,
  decision: AIDecision
): CheckpointDecision["reasoningCategory"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (REASONING_CATEGORIES.includes(normalized as CheckpointDecision["reasoningCategory"])) {
      return normalized as CheckpointDecision["reasoningCategory"];
    }
    if (["impulse", "impulsive", "weak_reason", "vague_reason", "not_enough_info"].includes(normalized)) {
      return "insufficient_reason";
    }
    if (["intentional", "deliberate", "clear_intent", "clear_purpose"].includes(normalized)) {
      return "clear_intention";
    }
    if (["repeated", "repeat", "habit", "same_excuse"].includes(normalized)) {
      return "repeated_excuse";
    }
    if (["high_risk", "risk", "unsafe_pattern"].includes(normalized)) {
      return "high_risk_pattern";
    }
  }

  switch (decision) {
    case "ALLOW":
      return "clear_intention";
    case "BLOCK":
      return "high_risk_pattern";
    default:
      return "insufficient_reason";
  }
}

function normalizeMemoryReasonCategory(value: unknown): CheckpointDecision["memoryUpdate"]["reasonCategory"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (MEMORY_REASON_CATEGORIES.includes(normalized as CheckpointDecision["memoryUpdate"]["reasonCategory"])) {
      return normalized as CheckpointDecision["memoryUpdate"]["reasonCategory"];
    }
    if (["relax", "relaxation", "fun", "entertainment", "curiosity"].includes(normalized)) {
      return "other";
    }
    if (["procrastination", "routine", "automatic"].includes(normalized)) {
      return "habit";
    }
  }
  return "other";
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

export function validateDecisionConstraints(
  decision: CheckpointDecision,
  strictness: StrictnessLevel,
  options: { isFinalTurn?: boolean } = {}
): void {
  if (decision.decision === "ALLOW") {
    const cap = STRICTNESS_UNLOCK_CAP_MINUTES[strictness];
    if (typeof decision.unlockMinutes !== "number" || decision.unlockMinutes <= 0 || decision.unlockMinutes > cap) {
      throw new Error(`ALLOW decision requires unlockMinutes between 1 and ${cap}.`);
    }
  }

  if (decision.decision === "AI_COOLDOWN") {
    if (typeof decision.aiCooldownSeconds !== "number") {
      throw new Error("AI_COOLDOWN decision requires aiCooldownSeconds.");
    }
    const normalized = normalizeAICooldownSeconds(strictness, decision.aiCooldownSeconds);
    if (!normalized) {
      throw new Error("AI_COOLDOWN decision requires aiCooldownSeconds inside a sane strictness-derived range.");
    }
    decision.aiCooldownSeconds = normalized.normalizedSeconds;
    if (normalized.originalSeconds !== normalized.normalizedSeconds) {
      decision.aiCooldownNormalization = normalized;
    }
  }

  if (decision.decision === "ASK_MORE") {
    if (options.isFinalTurn) {
      throw new Error("ASK_MORE is not allowed on the final AI Check turn.");
    }
    if (!decision.nextQuestion?.trim()) {
      throw new Error("ASK_MORE decision requires nextQuestion.");
    }
  }
}
