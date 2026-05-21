export type StrictnessLevel = "gentle" | "balanced" | "strict" | "monk";
export type BlockedTargetType = "domain" | "exactUrl";
export type AIDecision = "ALLOW" | "AI_COOLDOWN" | "ASK_MORE" | "BLOCK";
export type ProviderId = "openai" | "deepseek" | "kimi";
export type DecisionReasonCategory =
  | "repeated_excuse"
  | "clear_intention"
  | "high_risk_pattern"
  | "low_risk"
  | "insufficient_reason";
export type BehaviorReasonCategory =
  | "stress"
  | "boredom"
  | "loneliness"
  | "escape"
  | "habit"
  | "intentional"
  | "other";
export type AICheckScoreName = "repeatedReason" | "impulse" | "deliberateness";
export type AICheckScores = Record<AICheckScoreName, number>;
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
  envKey?: string;
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
  strictness?: StrictnessLevel;
  promptVersion?: string;
  schemaVersion?: string;
  rubricVersion?: string;
  roundSnapshot?: AICheckRoundSnapshot;
  finalDecision?: AIDecision;
  finalDecisionId?: string;
  aiCooldownStartedAt?: string;
  aiCooldownUntil?: string;
  aiCooldownSeconds?: number;
  aiCooldownDecisionId?: string;
  aiCooldownCompletedAt?: string;
  patternMemoryUpdatedCategories?: BehaviorReasonCategory[];
}

export interface AICheckRoundSnapshot {
  sessionId: string;
  targetId: string;
  targetDisplay: string;
  strictness: StrictnessLevel;
  maxAssistantTurns: number;
  maxSessionSeconds: number;
  aiCooldownPolicy: {
    minSeconds: number;
    defaultSeconds: number;
    maxSeconds: number;
  };
  unlockCapMinutes: number;
  patternMemorySnapshot: PatternMemory[];
  versions: {
    promptVersion: string;
    schemaVersion: string;
    rubricVersion: string;
  };
  provider?: {
    id: ProviderId;
    model: string;
  };
  createdAt: string;
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
  decisionReasonCategory: DecisionReasonCategory;
  unlockMinutes: number | null;
  aiCooldownSeconds: number | null;
  aiCooldownNormalization?: {
    originalSeconds: number;
    normalizedSeconds: number;
    minSeconds: number;
    maxSeconds: number;
  };
  nextQuestion: string | null;
  scores: AICheckScores;
  memoryUpdate: {
    behaviorReasonCategory: BehaviorReasonCategory;
    patternNote: string | null;
  };
  createdAt: string;
  rawProvider?: string;
}

export interface PatternMemory {
  id: string;
  targetDisplay: string;
  behaviorReasonCategory: BehaviorReasonCategory;
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
  behaviorReasonCategory: BehaviorReasonCategory;
  shortSummary: string;
  createdAt: string;
}

export type BadCaseErrorType =
  | "over_allow"
  | "over_block"
  | "under_ask"
  | "unnecessary_ask"
  | "wrong_reason_strength"
  | "wrong_strictness_application"
  | "wrong_cooldown_duration"
  | "unsafe_sensitive_advice"
  | "bad_tone"
  | "schema_or_format_failure";

export interface BadCaseReview {
  id: string;
  sourceSessionId: string;
  sourceDecisionId: string | null;
  targetDisplay: string;
  strictness: StrictnessLevel | null;
  messages: AICheckMessage[];
  actualDecision: AIDecision | null;
  expectedDecision: AIDecision | null;
  errorTypes: BadCaseErrorType[];
  reviewerNote: string;
  convertedEvalCaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AICheckCaseInput {
  targetDisplay: string;
  strictness: StrictnessLevel;
  sessionContext: {
    assistantTurnCount: number;
    maxAssistantTurns: number;
    isFinalTurn: boolean;
  };
  messages: Array<Pick<AICheckMessage, "role" | "content" | "source">>;
  patternMemorySnapshot: Array<
    Omit<PatternMemory, "id"> & {
      id?: string;
    }
  >;
}

export interface AICheckCaseOutput {
  provider?: ProviderId | "mock";
  model?: string;
  rawProvider?: string;
  parsed: Omit<CheckpointDecision, "id" | "sessionId" | "createdAt" | "decisionReasonCategory" | "memoryUpdate"> & {
    decisionReasonCategory: DecisionReasonCategory;
    memoryUpdate: {
      behaviorReasonCategory: BehaviorReasonCategory;
      patternNote: string | null;
    };
  };
}

export interface AICheckCaseEval {
  expectedOutput: {
    decision: AIDecision;
    decisionReasonCategory?: DecisionReasonCategory;
    behaviorReasonCategory?: BehaviorReasonCategory;
  };
  allowedDecisions?: AIDecision[];
  disallowedDecisions?: AIDecision[];
  expectedCooldownRangeSeconds?: { min: number; max: number };
  expectedScoreRanges?: Partial<Record<AICheckScoreName, { min: number; max: number }>>;
  mustAskAbout?: string[];
  mustNotSay?: string[];
  tags: string[];
  reviewerNote?: string;
}

export type AICheckCaseStatus = "draft" | "ready" | "regression" | "archived";

export interface AICheckCase {
  id: string;
  title: string;
  source: "authored_eval" | "real_session" | "bad_case_review";
  versions: {
    promptVersion: string;
    schemaVersion: string;
    rubricVersion: string;
  };
  input: AICheckCaseInput;
  output?: AICheckCaseOutput;
  eval?: AICheckCaseEval;
  status: AICheckCaseStatus;
  archivedAt?: string;
  archivedReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AICheckCaseSet {
  id: string;
  name: string;
  description: string;
  filters: {
    statuses?: AICheckCaseStatus[];
    tags?: string[];
    strictness?: StrictnessLevel[];
    expectedDecisions?: AIDecision[];
    promptVersions?: string[];
    schemaVersions?: string[];
    rubricVersions?: string[];
    includeArchived?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AICheckSchemaFieldReference {
  path: string;
  type: string;
  required: boolean;
  nullable?: boolean;
  example?: unknown;
  meaning: string;
  whyNecessary: string;
  productImpact: string;
  validation: string;
  commonMistakes: string;
}

export interface AICheckEvalRun {
  id: string;
  promptVersion: string;
  schemaVersion: string;
  rubricVersion: string;
  providerMode: "mock" | "byok";
  createdAt: string;
}

export interface AICheckEvalResult {
  id: string;
  runId: string;
  evalCaseId: string;
  actualDecision: AIDecision | null;
  pass: boolean;
  failureReasons: string[];
  rawProvider?: string;
  createdAt: string;
}

export interface AIPMReviewSession {
  session: AICheckSession;
  messages: AICheckMessage[];
  decisions: CheckpointDecision[];
  badCase: BadCaseReview | null;
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
  | "ai_cooldown_started"
  | "ai_cooldown_completed"
  | "ai_cooldown_message_attempt_blocked"
  | "ai_cooldown_seconds_normalized"
  | "ai_final_turn_reached"
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
  | { type: "ai/getLatestBlockedSession"; payload: { targetId: string } }
  | { type: "ai/recentSessions" }
  | { type: "review/listSessions" }
  | {
      type: "review/createBadCase";
      payload: {
        sessionId: string;
        decisionId?: string | null;
        expectedDecision?: AIDecision | null;
        errorTypes: BadCaseErrorType[];
        reviewerNote: string;
      };
    }
  | {
      type: "review/updateBadCase";
      payload: {
        id: string;
        expectedDecision?: AIDecision | null;
        errorTypes?: BadCaseErrorType[];
        reviewerNote?: string;
      };
  }
  | { type: "review/convertBadCaseToEval"; payload: { badCaseId: string; title?: string } }
  | { type: "review/listEvalCases" }
  | { type: "review/createEvalCase"; payload: CreateEvalCaseInput }
  | { type: "review/updateEvalCase"; payload: UpdateEvalCaseInput }
  | { type: "review/archiveEvalCase"; payload: { id: string; archivedReason?: string } }
  | { type: "settings/update"; payload: Partial<UserSettings> }
  | { type: "provider/saveApiKey"; payload: { provider: ProviderId; apiKey: string } }
  | { type: "provider/deleteApiKey"; payload: { provider: ProviderId } }
  | { type: "provider/status" }
  | { type: "data/export" }
  | { type: "data/deleteAll" };

export interface CreateEvalCaseInput {
  title: string;
  source?: AICheckCase["source"];
  status?: AICheckCaseStatus;
  targetDisplay: string;
  strictness: StrictnessLevel;
  userMessage: string;
  expectedDecision: AIDecision;
  tags: string[];
  reviewerNote?: string;
  mustAskAbout?: string[];
  mustNotSay?: string[];
}

export interface UpdateEvalCaseInput {
  id: string;
  title?: string;
  status?: AICheckCaseStatus;
  targetDisplay?: string;
  strictness?: StrictnessLevel;
  userMessage?: string;
  expectedDecision?: AIDecision;
  tags?: string[];
  reviewerNote?: string;
  mustAskAbout?: string[];
  mustNotSay?: string[];
}

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
