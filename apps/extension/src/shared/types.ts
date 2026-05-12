export type StrictnessLevel = "gentle" | "balanced" | "strict" | "monk";
export type BlockedTargetType = "domain" | "exactUrl";
export type AIDecision = "ALLOW" | "DELAY" | "ASK_MORE" | "BLOCK";
export type ProviderId = "openai" | "deepseek" | "kimi";
export type AccessState =
  | "not_blocked"
  | "blocked"
  | "cooling_down"
  | "temporarily_unlocked"
  | "block_held_until_tomorrow";
export type AIAvailability = "locked_free" | "missing_provider_key" | "blocked_by_hold" | "ready";
export type TrackStatus =
  | "active"
  | "delayed"
  | "allowed"
  | "blocked"
  | "expired"
  | "provider_error"
  | "completed";

export interface BlockedTarget {
  id: string;
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
  unlockMinutes: number;
  completedAt?: string;
}

export interface BlockHold {
  id: string;
  targetId: string;
  targetDisplay: string;
  expiresAt: string;
  createdAt: string;
  sourceTrackId: string;
}

export interface TargetAttempt {
  id: string;
  targetId: string;
  tabId?: number;
  attemptUrl: string;
  createdAt: string;
}

export interface LicenseState {
  status: "free" | "lifetime_mock";
  deviceLabel?: string;
  lastCheckedAt?: string;
}

export interface UserSettings {
  strictness: StrictnessLevel;
  preferredTone: "calm" | "direct" | "coach";
  onboardingCompleted: boolean;
  aiPmMode: boolean;
  provider: ProviderId;
  model: string;
  license: LicenseState;
}

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

export interface AITrack {
  id: string;
  targetId: string;
  targetDisplay: string;
  status: TrackStatus;
  startedAt: string;
  expiresAt: string;
  completedAt?: string;
  assistantTurnCount: number;
  maxAssistantTurns: number;
  finalDecision?: AIDecision;
  finalDecisionId?: string;
  badCaseReviewId?: string;
}

export interface AITrackMessage {
  id: string;
  trackId: string;
  role: "system" | "assistant" | "user";
  content: string;
  source: "local_opening" | "user" | "llm" | "system";
  createdAt: string;
}

export interface CheckpointDecision {
  id: string;
  trackId: string;
  decision: AIDecision;
  userFacingMessage: string;
  reasoningCategory:
    | "repeated_excuse"
    | "clear_intention"
    | "high_risk_pattern"
    | "low_risk"
    | "insufficient_reason";
  unlockMinutes: number | null;
  delaySeconds: number | null;
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

export interface AITrackSummary {
  id: string;
  trackId: string;
  targetDisplay: string;
  finalDecision: AIDecision;
  reasonCategory: CheckpointDecision["memoryUpdate"]["reasonCategory"];
  shortSummary: string;
  createdAt: string;
}

export type BadCaseSeverity = "low" | "medium" | "high";
export type BadCaseType =
  | "wrong_decision"
  | "weak_challenge"
  | "schema_issue"
  | "tone_issue"
  | "memory_miss"
  | "policy_risk";

export interface BadCaseReview {
  id: string;
  trackId: string;
  targetDisplay: string;
  observedDecision: AIDecision;
  expectedDecision: AIDecision;
  severity: BadCaseSeverity;
  types: BadCaseType[];
  pmNote: string;
  rootCause: string;
  proposedEvalAssertion: string;
  createdAt: string;
}

export interface EvalCase {
  id: string;
  sourceBadCaseId: string;
  title: string;
  targetDisplay: string;
  promptInput: string;
  expectedDecision: AIDecision;
  assertions: string[];
  tags: string[];
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

export type ExtensionMessage =
  | { type: "bootstrap/getState" }
  | { type: "blockedTargets/add"; payload: { input: string; targetType: BlockedTargetType } }
  | { type: "blockedTargets/delete"; payload: { id: string } }
  | { type: "blockedTargets/list" }
  | { type: "blocking/getPageAccess"; payload: { url: string } }
  | { type: "blocking/startCooldown"; payload: { targetId: string } }
  | { type: "blocking/completeCooldown"; payload: { cooldownId: string } }
  | { type: "ai/startTrack"; payload: { targetId: string } }
  | { type: "ai/sendMessage"; payload: { trackId: string; content: string } }
  | { type: "ai/getTrack"; payload: { trackId: string } }
  | { type: "ai/recentTracks" }
  | { type: "settings/update"; payload: Partial<Omit<UserSettings, "license">> }
  | { type: "license/devUnlock" }
  | { type: "license/reset" }
  | { type: "provider/saveApiKey"; payload: { provider: ProviderId; apiKey: string } }
  | { type: "provider/deleteApiKey"; payload: { provider: ProviderId } }
  | { type: "provider/status" }
  | { type: "review/list" }
  | { type: "review/create"; payload: Omit<BadCaseReview, "id" | "createdAt"> }
  | { type: "eval/createFromBadCase"; payload: { badCaseId: string } }
  | { type: "eval/list" }
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
  holds: BlockHold[];
  targetAttempts: TargetAttempt[];
  providerKeys: Record<ProviderId, boolean>;
}
