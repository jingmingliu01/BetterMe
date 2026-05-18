export type StrictnessLevel = "gentle" | "balanced" | "strict" | "monk";
export type BlockedTargetType = "domain" | "exactUrl";
export type AIDecision = "ALLOW" | "AI_COOLDOWN" | "ASK_MORE" | "BLOCK";
export type ProviderId = "openai" | "deepseek" | "kimi";
export type AccessState =
  | "not_blocked"
  | "blocked"
  | "cooling_down"
  | "temporarily_unlocked"
  | "block_held_until_tomorrow";
export type AIReadiness =
  | "ready"
  | "missing_provider_key"
  | "invalid_provider_model"
  | "blocked_by_hold"
  | "cooling_down"
  | "temporarily_unlocked"
  | "target_missing";
export type AICheckSessionStatus =
  | "active"
  | "ai_cooling_down"
  | "allowed"
  | "blocked"
  | "expired"
  | "provider_error"
  | "schema_error"
  | "completed";
export type ProviderErrorCode =
  | "missing_key"
  | "invalid_key"
  | "invalid_model"
  | "rate_limited"
  | "insufficient_quota"
  | "provider_timeout"
  | "network_error"
  | "bad_provider_response"
  | "unknown_provider_error";

export interface BlockedTarget {
  id: string;
  targetKey?: string;
  type: BlockedTargetType;
  value: string;
  display: string;
  createdAt: string;
  enabled: boolean;
  source: "manual" | "preset";
  category?: "nsfw" | "social" | "video" | "gaming" | "custom";
}

export interface TemporaryUnlock {
  id: string;
  targetId: string;
  targetDisplay: string;
  expiresAt: string;
  createdAt: string;
  source: "ai_allow" | "basic_cooldown";
}

export interface BasicCooldown {
  id: string;
  targetId: string;
  targetDisplay: string;
  attemptUrl: string | null;
  createdAt: string;
  endsAt: string;
  claimExpiresAt?: string;
  unlockMinutes: number;
  strictness?: StrictnessLevel;
  attemptCount?: number;
  completedAt?: string;
}

export interface CooldownEscalation {
  targetId: string;
  count: number;
  windowStartedAt: string;
  lastStartedAt: string;
}

export interface BlockHold {
  id: string;
  targetId: string;
  targetDisplay: string;
  expiresAt: string;
  createdAt: string;
  sourceSessionId: string;
}

export interface TargetAttempt {
  id: string;
  targetId: string;
  tabId?: number;
  attemptUrl: string;
  createdAt: string;
}

export interface UserSettings {
  strictness: StrictnessLevel;
  preferredTone: "calm" | "direct" | "coach";
  onboardingCompleted: boolean;
  provider: ProviderId;
  model: string;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

export interface ProviderKeyRevision {
  provider: ProviderId;
  updatedAt: string;
  action: "saved" | "deleted";
}

export interface AICheckSession {
  id: string;
  targetId: string;
  targetKey?: string;
  targetDisplay: string;
  status: AICheckSessionStatus;
  startedAt: string;
  expiresAt: string;
  completedAt?: string;
  assistantTurnCount: number;
  maxAssistantTurns: number;
  finalDecision?: AIDecision;
  finalDecisionId?: string;
}

export interface AICheckMessage {
  id: string;
  sessionId: string;
  role: "system" | "assistant" | "user";
  content: string;
  source: "local_opening" | "user" | "llm" | "system";
  createdAt: string;
}

export interface CheckpointDecision {
  id: string;
  sessionId: string;
  decision: AIDecision;
  userFacingMessage: string;
  reasoningCategory:
    | "repeated_excuse"
    | "clear_intention"
    | "high_risk_pattern"
    | "low_risk"
    | "insufficient_reason";
  unlockMinutes: number | null;
  aiCooldownSeconds: number | null;
  nextQuestion: string | null;
  scores: {
    repeatedReason: number;
    impulse: number;
    deliberateness: number;
  };
  memoryUpdate: {
    reasonCategory:
      | "stress"
      | "boredom"
      | "loneliness"
      | "escape"
      | "habit"
      | "intentional"
      | "other";
    patternNote: string | null;
  };
  createdAt: string;
  rawProvider?: string;
}

export interface PatternMemory {
  id: string;
  targetDisplay: string;
  reasonCategory: CheckpointDecision["memoryUpdate"]["reasonCategory"];
  repeatedCount: number;
  lastUserReason: string;
  guidance: string;
  updatedAt: string;
}

export interface AICheckSummary {
  id: string;
  sessionId: string;
  targetDisplay: string;
  finalDecision: AIDecision;
  reasonCategory: CheckpointDecision["memoryUpdate"]["reasonCategory"];
  shortSummary: string;
  createdAt: string;
}

export interface PageAccessInfo {
  targetId: string | null;
  targetDisplay: string | null;
  unlockId: string | null;
  unlockExpiresAt: string | null;
  unlockWarningRemainingSeconds: number;
  shouldRedirectNow: boolean;
}

export type BehaviorEventType =
  | "blocked_target_added"
  | "blocked_target_remove_prompt_opened"
  | "blocked_target_remove_cancelled"
  | "blocked_target_removed"
  | "blocked_target_readded"
  | "blocked_url_attempted"
  | "cooldown_started"
  | "cooldown_claim_expired"
  | "cooldown_continued"
  | "temporary_unlock_created"
  | "temporary_unlock_expired"
  | "ai_check_session_started"
  | "ai_decision_applied"
  | "block_hold_created"
  | "strictness_changed";

export interface BehaviorEvent {
  id: string;
  type: BehaviorEventType;
  targetKey?: string;
  targetId?: string;
  targetDisplay?: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export type ExtensionMessage =
  | { type: "bootstrap/getState" }
  | { type: "blockedTargets/add"; payload: { input: string; targetType: BlockedTargetType } }
  | {
      type: "blockedTargets/delete";
      payload: { id: string; confirmationElapsedMs?: number; confirmationPhraseAccepted?: boolean };
    }
  | {
      type: "behavior/logEvent";
      payload: {
        eventType: "blocked_target_remove_prompt_opened" | "blocked_target_remove_cancelled";
        targetId?: string;
        payload?: Record<string, unknown>;
      };
    }
  | { type: "blockedTargets/list" }
  | { type: "blocking/getPageAccess"; payload: { url: string } }
  | { type: "blocking/startCooldown"; payload: { targetId: string } }
  | { type: "blocking/completeCooldown"; payload: { cooldownId: string } }
  | { type: "ai/startAndSend"; payload: { targetId: string; content: string } }
  | { type: "ai/sendMessage"; payload: { sessionId: string; content: string } }
  | { type: "ai/getSession"; payload: { sessionId: string } }
  | { type: "ai/recentSessions" }
  | { type: "settings/update"; payload: Partial<UserSettings> }
  | { type: "provider/saveApiKey"; payload: { provider: ProviderId; apiKey: string } }
  | { type: "provider/deleteApiKey"; payload: { provider: ProviderId } }
  | { type: "provider/status" }
  | { type: "data/export" }
  | { type: "data/deleteAll" };

export interface ExtensionResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface BootstrapState {
  settings: UserSettings;
  blockedTargets: BlockedTarget[];
  unlocks: TemporaryUnlock[];
  cooldowns: BasicCooldown[];
  cooldownEscalations: CooldownEscalation[];
  holds: BlockHold[];
  targetAttempts: TargetAttempt[];
  providerKeys: Record<ProviderId, boolean>;
  behaviorEvents: BehaviorEvent[];
}
