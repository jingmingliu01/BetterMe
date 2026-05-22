import { createId, nowIso } from "../shared/id";
import { normalizeAICooldownSeconds, STRICTNESS_UNLOCK_CAP_MINUTES } from "../shared/constants";
import {
  AI_CHECK_BEHAVIOR_REASON_CATEGORIES,
  AI_CHECK_DECISION_REASON_CATEGORIES,
  AI_CHECK_DECISIONS
} from "../shared/ai-check-contract";
import type { AICheckScoreName, AIDecision, CheckpointDecision, StrictnessLevel } from "../shared/types";

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function requireKey(record: Record<string, unknown>, key: string): unknown {
  if (!(key in record)) {
    throw new Error(`LLM response missing required field ${key}.`);
  }
  return record[key];
}

function requireObject(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`LLM response field ${key} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`LLM response field ${key} must be a non-empty string.`);
  }
  return value;
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
  const userFacingMessage = requireString(requireKey(parsed, "userFacingMessage"), "userFacingMessage");
  const decisionReasonCategory = normalizeDecisionReasonCategory(
    requireKey(parsed, "decisionReasonCategory"),
    decision
  );
  const unlockMinutes = requireKey(parsed, "unlockMinutes");
  const aiCooldownSeconds = requireKey(parsed, "aiCooldownSeconds");

  const scores = requireObject(requireKey(parsed, "scores"), "scores");
  const memoryUpdate = requireObject(requireKey(parsed, "memoryUpdate"), "memoryUpdate");
  const behaviorReasonCategory = normalizeBehaviorReasonCategory(
    requireKey(memoryUpdate, "behaviorReasonCategory")
  );
  requireKey(memoryUpdate, "patternNote");

  return {
    id: createId("decision"),
    sessionId,
    decision,
    userFacingMessage,
    decisionReasonCategory,
    unlockMinutes: typeof unlockMinutes === "number" ? unlockMinutes : null,
    aiCooldownSeconds: typeof aiCooldownSeconds === "number" ? aiCooldownSeconds : null,
    scores: {
      repeatedReason: readScore(scores.repeatedReason, "repeatedReason"),
      impulse: readScore(scores.impulse, "impulse"),
      deliberateness: readScore(scores.deliberateness, "deliberateness")
    },
    memoryUpdate: {
      behaviorReasonCategory,
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

function normalizeDecisionReasonCategory(
  value: unknown,
  decision: AIDecision
): CheckpointDecision["decisionReasonCategory"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (AI_CHECK_DECISION_REASON_CATEGORIES.includes(normalized as CheckpointDecision["decisionReasonCategory"])) {
      return normalized as CheckpointDecision["decisionReasonCategory"];
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

function normalizeBehaviorReasonCategory(value: unknown): CheckpointDecision["memoryUpdate"]["behaviorReasonCategory"] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (AI_CHECK_BEHAVIOR_REASON_CATEGORIES.includes(normalized as CheckpointDecision["memoryUpdate"]["behaviorReasonCategory"])) {
      return normalized as CheckpointDecision["memoryUpdate"]["behaviorReasonCategory"];
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
  return AI_CHECK_DECISIONS.includes(value as AIDecision) ? (value as AIDecision) : null;
}

export function createFallbackDecision(sessionId: string, message: string): CheckpointDecision {
  return {
    id: createId("decision"),
    sessionId,
    decision: "ASK_MORE",
    userFacingMessage: message,
    decisionReasonCategory: "insufficient_reason",
    unlockMinutes: null,
    aiCooldownSeconds: null,
    scores: {
      repeatedReason: 0,
      impulse: 60,
      deliberateness: 35
    },
    memoryUpdate: {
      behaviorReasonCategory: "other",
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
    if (!decision.userFacingMessage.trim()) {
      throw new Error("ASK_MORE decision requires a userFacingMessage question.");
    }
  }
}
