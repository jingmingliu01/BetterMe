import type { ProviderConfig, StrictnessLevel, UserSettings } from "./types";

export interface BasicCooldownPolicy {
  cooldownSeconds: number;
  unlockSeconds: number;
  claimWindowSeconds: number;
}

export const ACCESS_TIMING = {
  basicCooldownSeconds: 5 * 60,
  basicCooldownUnlockSeconds: 5 * 60,
  completedCooldownClaimSeconds: 5 * 60,
  unlockWarningRemainingSeconds: 60
} as const;

export const BASIC_COOLDOWN_SECONDS = ACCESS_TIMING.basicCooldownSeconds;
export const AI_TRACK_MAX_ASSISTANT_TURNS = 5;
export const AI_TRACK_MAX_SECONDS = 10 * 60;

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

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4-mini",
    models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v4-flash",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"]
  },
  {
    id: "kimi",
    label: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "kimi-k2.5",
    models: [
      "kimi-k2.5",
      "kimi-k2-0905-preview",
      "kimi-k2-0711-preview",
      "kimi-k2-turbo-preview",
      "kimi-k2-thinking",
      "kimi-k2-thinking-turbo",
      "moonshot-v1-8k",
      "moonshot-v1-32k",
      "moonshot-v1-128k"
    ]
  }
];

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
