import { AI_CHECK_SESSION_POLICY } from "./ai-check-contract";
import { PROVIDER_CONFIGS } from "./provider-config";
import type { StrictnessLevel, UserSettings } from "./types";

export interface BasicCooldownPolicy {
  cooldownSeconds: number;
  unlockSeconds: number;
  claimWindowSeconds: number;
}

export interface AICooldownPolicy {
  minSeconds: number;
  defaultSeconds: number;
  maxSeconds: number;
}

export interface AICooldownNormalization {
  originalSeconds: number;
  normalizedSeconds: number;
  minSeconds: number;
  maxSeconds: number;
}

export const ACCESS_TIMING = {
  basicCooldownSeconds: 5 * 60,
  basicCooldownUnlockSeconds: 5 * 60,
  completedCooldownClaimSeconds: 5 * 60,
  unlockWarningRemainingSeconds: 60
} as const;

export const BASIC_COOLDOWN_SECONDS = ACCESS_TIMING.basicCooldownSeconds;
export const AI_CHECK_SESSION_MAX_ASSISTANT_TURNS = AI_CHECK_SESSION_POLICY.maxAssistantTurns;
export const AI_CHECK_SESSION_MAX_SECONDS = AI_CHECK_SESSION_POLICY.maxSessionSeconds;

export const STRICTNESS_ORDER: StrictnessLevel[] = ["gentle", "balanced", "strict", "monk"];

export const BASIC_COOLDOWN_POLICIES: Record<StrictnessLevel, BasicCooldownPolicy> = {
  gentle: {
    cooldownSeconds: 3 * 60,
    unlockSeconds: 10 * 60,
    claimWindowSeconds: 10 * 60
  },
  balanced: {
    cooldownSeconds: ACCESS_TIMING.basicCooldownSeconds,
    unlockSeconds: ACCESS_TIMING.basicCooldownUnlockSeconds,
    claimWindowSeconds: ACCESS_TIMING.completedCooldownClaimSeconds
  },
  strict: {
    cooldownSeconds: 10 * 60,
    unlockSeconds: 3 * 60,
    claimWindowSeconds: 3 * 60
  },
  monk: {
    cooldownSeconds: 15 * 60,
    unlockSeconds: 2 * 60,
    claimWindowSeconds: 2 * 60
  }
};

export const AI_COOLDOWN_POLICIES: Record<StrictnessLevel, AICooldownPolicy> = {
  gentle: {
    minSeconds: 30,
    defaultSeconds: 60,
    maxSeconds: 3 * 60
  },
  balanced: {
    minSeconds: 60,
    defaultSeconds: 2 * 60,
    maxSeconds: 5 * 60
  },
  strict: {
    minSeconds: 3 * 60,
    defaultSeconds: 5 * 60,
    maxSeconds: 10 * 60
  },
  monk: {
    minSeconds: 5 * 60,
    defaultSeconds: 10 * 60,
    maxSeconds: 20 * 60
  }
};

export function normalizeAICooldownSeconds(
  strictness: StrictnessLevel,
  value: number
): AICooldownNormalization | null {
  const policy = AI_COOLDOWN_POLICIES[strictness];
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value > policy.maxSeconds * 2) {
    return null;
  }
  const normalizedSeconds = Math.round(Math.min(Math.max(value, policy.minSeconds), policy.maxSeconds));
  return {
    originalSeconds: value,
    normalizedSeconds,
    minSeconds: policy.minSeconds,
    maxSeconds: policy.maxSeconds
  };
}

export const COOLDOWN_ESCALATION_WINDOW_SECONDS = 60 * 60;

export function getEscalatedStrictness(baseStrictness: StrictnessLevel, attemptCount: number): StrictnessLevel {
  const baseIndex = STRICTNESS_ORDER.indexOf(baseStrictness);
  const safeBaseIndex = baseIndex >= 0 ? baseIndex : STRICTNESS_ORDER.indexOf("balanced");
  const nextIndex = Math.min(STRICTNESS_ORDER.length - 1, safeBaseIndex + Math.max(0, attemptCount - 1));
  return STRICTNESS_ORDER[nextIndex];
}

export const STRICTNESS_UNLOCK_CAP_MINUTES: Record<StrictnessLevel, number> = {
  gentle: 30,
  balanced: 15,
  strict: 10,
  monk: 5
};

export const STRICTNESS_LABELS: Record<StrictnessLevel, string> = {
  gentle: "Gentle",
  balanced: "Balanced",
  strict: "Strict",
  monk: "Monk"
};

export const STRICTNESS_DESCRIPTIONS: Record<StrictnessLevel, string> = {
  gentle: "Light friction for getting started. Best when you mainly need a pause, not a hard stop.",
  balanced: "Default checkpoint. Keeps the current 5 minute cooldown and 5 minute access window.",
  strict: "Stronger guardrail for high-stimulation sites. Longer wait, shorter access.",
  monk: "Maximum Basic Cooldown friction. Use for targets you repeatedly regret opening."
};

export const BLOCK_TARGET_ACTION_LABELS = {
  domain: "Block This Domain",
  exactUrl: "Block This Exact URL Only",
  alreadyBlocked: "Already Blocked"
} as const;

export const PROVIDERS = PROVIDER_CONFIGS;

export const DEFAULT_SETTINGS: UserSettings = {
  strictness: "balanced",
  preferredTone: "calm",
  onboardingCompleted: false,
  provider: "openai",
  model: "gpt-5.4-mini"
};

export const STORAGE_KEYS = {
  settings: "betterme.settings",
  blockedTargets: "betterme.blockedTargets",
  unlocks: "betterme.unlocks",
  cooldowns: "betterme.cooldowns",
  holds: "betterme.holds",
  cooldownEscalations: "betterme.cooldownEscalations",
  targetAttempts: "betterme.targetAttempts",
  providerKeyRevision: "betterme.providerKeyRevision",
  encryptedApiKeys: "betterme.encryptedApiKeys"
} as const;

export const BLOCK_PAGE_PATH = "/block.html";

export const OPENING_MESSAGE_TEMPLATE =
  "You're trying to open {displayTarget}. What are you here to do, and why now?";
