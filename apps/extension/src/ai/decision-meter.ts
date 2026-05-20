import type { AIDecision, CheckpointDecision } from "../shared/types";

export interface DecisionMeter {
  value: number;
  label: string;
  zone: "block" | "cooldown" | "allow";
}

export function getDecisionMeter(decision: CheckpointDecision): DecisionMeter {
  const impulse = normalizeScore(decision.scores.impulse);
  const deliberateness = normalizeScore(decision.scores.deliberateness);
  const repeatedReason = normalizeScore(decision.scores.repeatedReason);
  const raw = clamp(50 + (deliberateness - impulse) * 0.45 - repeatedReason * 0.2, 0, 100);
  const value = constrainByDecision(decision.decision, raw);
  return {
    value,
    label: getMeterLabel(decision.decision, value),
    zone: getMeterZone(decision.decision, value)
  };
}

export function normalizeScore(value: number): number {
  return clamp(value <= 10 ? value * 10 : value, 0, 100);
}

export function formatScore(value: number): string {
  return `${Math.round(normalizeScore(value))}/100`;
}

function constrainByDecision(decision: AIDecision, value: number): number {
  switch (decision) {
    case "ALLOW":
      return clamp(value, 72, 100);
    case "BLOCK":
      return clamp(value, 0, 28);
    case "AI_COOLDOWN":
      return clamp(value, 34, 66);
    case "ASK_MORE":
      return clamp(value, 28, 72);
    default:
      return value;
  }
}

function getMeterLabel(decision: AIDecision, value: number): string {
  if (decision === "ALLOW") {
    return "Leaning allow";
  }
  if (decision === "AI_COOLDOWN") {
    return "Leaning cooldown";
  }
  if (decision === "BLOCK") {
    return "Leaning block";
  }
  if (value >= 68) {
    return "Leaning allow";
  }
  if (value <= 32) {
    return "Leaning block";
  }
  if (value <= 48) {
    return "Leaning cooldown";
  }
  return "Still weighing this";
}

function getMeterZone(decision: AIDecision, value: number): DecisionMeter["zone"] {
  if (decision === "ALLOW") return "allow";
  if (decision === "BLOCK") return "block";
  if (decision === "AI_COOLDOWN") return "cooldown";
  if (value >= 68) return "allow";
  if (value <= 32) return "block";
  return "cooldown";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
