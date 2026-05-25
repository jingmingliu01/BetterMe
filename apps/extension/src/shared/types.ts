import type {
  AICheckCase,
  AICheckCaseInput,
  AICheckCaseOutput,
  AICheckDatasetType,
  AICheckCaseStatus,
  AICheckEvalResult,
  AICheckEvalMetrics,
  AICheckEvalReleaseGate,
  AICheckEvalRun,
  AICheckEvalRunFilters,
  AICheckEvalRunMode,
  AICheckExpectedInputEvidence,
  AICheckExpectedOutput,
  AICheckSeverity,
  AICheckScores,
  AIDecision,
  BadCaseErrorType,
  BehaviorReasonCategory,
  CheckpointDecision,
  StrictnessLevel
} from "./ai-check-contract.generated";

export type {
  AICheckCase,
  AICheckCaseEval,
  AICheckCaseInput,
  AICheckCaseOutput,
  AICheckCaseLineage,
  AICheckCaseProvenance,
  AICheckCaseStatus,
  AICheckDatasetType,
  AICheckContract,
  AICheckContractSection,
  AICheckCurrentVersions,
  AICheckDecisionExpectation,
  AICheckEvalResult,
  AICheckEvalMetricBreakdown,
  AICheckEvalMetrics,
  AICheckEvalReleaseGate,
  AICheckEvalRun,
  AICheckEvalRunFilters,
  AICheckEvalRunMode,
  AICheckExpectedInputEvidence,
  AICheckExpectedOutput,
  AICheckNullableNumberExpectation,
  AICheckNullableTextExpectation,
  AICheckNumberRangeExpectation,
  AICheckResolvedVersionEntry,
  AICheckSchemaFieldReference,
  AICheckScoreName,
  AICheckSeverity,
  AICheckScores,
  AICheckTextExpectation,
  AIDecision,
  BadCaseErrorType,
  BehaviorReasonCategory,
  CheckpointDecision,
  DecisionReasonCategory,
  StrictnessLevel
} from "./ai-check-contract.generated";

export type BlockedTargetType = "domain" | "exactUrl";
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
  envKey?: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  evalExecution?: {
    defaultMaxConcurrency: number;
    retryLimit: number;
    retryBackoffMs?: number[];
  };
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
  outputSchemaVersion?: string;
  evaluationSchemaVersion?: string;
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
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
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

export interface PatternMemory {
  id: string;
  targetDisplay: string;
  behaviorReasonCategory: BehaviorReasonCategory;
  repeatedCount: number;
  lastUserReason: string;
  guidance: string;
  updatedAt: string;
}

export interface AICheckDecisionPointSnapshot {
  id: string;
  sessionId: string;
  decisionId: string;
  triggeringUserMessageId: string | null;
  selectedAssistantMessageId?: string | null;
  nextAssistantTurn: number;
  assistantTurnCountBeforeDecision: number;
  maxAssistantTurns: number;
  isFinalTurn: boolean;
  roundSnapshot: AICheckRoundSnapshot;
  input: AICheckCaseInput;
  actualOutput?: AICheckCaseOutput;
  createdAt: string;
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

export interface BadCaseReview {
  id: string;
  sourceSessionId: string;
  sourceDecisionId: string | null;
  snapshotSource?: "persisted" | "derived";
  selectedAssistantMessageId?: string | null;
  triggeringUserMessageId?: string | null;
  decisionOrdinal?: number;
  targetDisplay: string;
  strictness: StrictnessLevel | null;
  messages: AICheckMessage[];
  inputSnapshot?: AICheckCaseInput;
  output?: AICheckCase["output"];
  actualDecision: AIDecision | null;
  expectedDecision: AIDecision | null;
  errorTypes: BadCaseErrorType[];
  reviewerNote: string;
  convertedEvalCaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AICheckCaseSet {
  id: string;
  name: string;
  description: string;
  filters: {
    statuses?: AICheckCaseStatus[];
    datasetTypes?: AICheckDatasetType[];
    tags?: string[];
    strictness?: StrictnessLevel[];
    expectedDecisions?: AIDecision[];
    promptVersions?: string[];
    outputSchemaVersions?: string[];
    evaluationSchemaVersions?: string[];
    includeArchived?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AIPMReviewSession {
  session: AICheckSession;
  messages: AICheckMessage[];
  decisions: CheckpointDecision[];
  decisionPointSources?: Record<string, "persisted" | "derived">;
  badCases?: BadCaseReview[];
  badCase: BadCaseReview | null;
}

export interface AICheckEvalRunSummary {
  run: AICheckEvalRun;
  results: AICheckEvalResult[];
}

export type AICheckEvalJobStatus = "queued" | "running" | "cancel_requested" | "completed" | "failed" | "cancelled";
export type AICheckEvalJobCaseStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "retryable_failed"
  | "failed"
  | "cancelled"
  | "skipped";

export interface AICheckEvalJobProgress {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

export interface AICheckEvalJob {
  id: string;
  kind: "eval_run";
  reservedRunId: string;
  outputRunId?: string;
  request: {
    filters: AICheckEvalRunFilters;
    mode: AICheckEvalRunMode;
    provider: AICheckEvalRun["provider"];
    providerMode: AICheckEvalRun["providerMode"];
    model: string;
    promptVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
    selectedCaseIds: string[];
    systemPromptAddendum?: string;
  };
  execution: {
    maxConcurrency: number;
    retryLimit: number;
    retryBackoffMs?: number[];
    cancelRequestedAt?: string;
    leaseOwner?: string;
    leaseExpiresAt?: string;
  };
  progress: AICheckEvalJobProgress;
  context?: {
    experimentId?: string;
    armId?: string;
    promptComparisonWorkflowId?: string;
    comparisonRole?: "baseline" | "candidate";
    promptCandidateId?: string;
  };
  status: AICheckEvalJobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface AICheckEvalJobCaseAttempt {
  attempt: number;
  status: "succeeded" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  providerErrorCode?: ProviderErrorCode;
  error?: string;
}

export interface AICheckEvalJobCaseState {
  id: string;
  jobId: string;
  reservedRunId: string;
  evalCaseId: string;
  caseSnapshot: AICheckCase;
  status: AICheckEvalJobCaseStatus;
  attempts: AICheckEvalJobCaseAttempt[];
  result?: AICheckEvalResult;
  createdAt: string;
  updatedAt: string;
}

export interface AICheckEvalJobSummary {
  job: AICheckEvalJob;
  cases: AICheckEvalJobCaseState[];
}

export interface ImportEvalRunArtifactInput {
  artifact: AICheckEvalRunSummary;
}

export type AICheckPromptCandidateStatus = "draft" | "archived";

export interface AICheckPromptCandidate {
  id: string;
  name: string;
  status: AICheckPromptCandidateStatus;
  instructionPatch: string;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AICheckTextualGradient {
  summary: string;
  failureClusters: Array<{
    label: string;
    cases: number;
    direction: string;
  }>;
  suggestedPromptDirections: string[];
  riskNotes: string[];
}

export interface AICheckPromptPromotionGate {
  status: "pass" | "fail";
  reasons: string[];
  datasetCoverage: Array<{
    datasetType: AICheckDatasetType;
    total: number;
    passed: number;
    passRate: number;
  }>;
}

export interface AICheckPromptComparison {
  id: string;
  candidateId: string;
  baselineRunId: string;
  candidateRunId: string;
  mode: AICheckEvalRunMode;
  provider: AICheckEvalRun["provider"];
  model: string;
  filters: AICheckEvalRunFilters;
  baselineMetrics: AICheckEvalMetrics;
  candidateMetrics: AICheckEvalMetrics;
  improvedCaseIds: string[];
  regressedCaseIds: string[];
  unchangedFailedCaseIds: string[];
  unchangedPassedCaseIds: string[];
  recommendation: "promote_candidate" | "revise_candidate" | "reject_candidate";
  promotionGate: AICheckPromptPromotionGate;
  textualGradient: AICheckTextualGradient;
  createdAt: string;
}

export interface AICheckPromptComparisonWorkflow {
  id: string;
  baselineJobId: string;
  candidateJobId: string;
  outputComparisonId?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancel_requested" | "cancelled";
  context?: {
    experimentId?: string;
    baselineArmId?: string;
    candidateArmId?: string;
    promptCandidateId: string;
  };
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface AICheckPromptComparisonWorkflowSummary {
  workflow: AICheckPromptComparisonWorkflow;
  baselineJob?: AICheckEvalJob;
  candidateJob?: AICheckEvalJob;
}

export interface AICheckPromptPromotion {
  id: string;
  candidateId: string;
  comparisonId: string;
  promptVersion: string;
  baselineRunId: string;
  candidateRunId: string;
  instructionPatch: string;
  note?: string;
  createdAt: string;
}

export type AICheckPromptProgramSuggestionKind = "prompt_patch" | "rubric" | "schema";
export type AICheckPromptProgramSuggestionReviewStatus = "proposed" | "accepted" | "rejected";

export interface AICheckPromptProgramSuggestionItem {
  id: string;
  kind: AICheckPromptProgramSuggestionKind;
  status: AICheckPromptProgramSuggestionReviewStatus;
  title: string;
  suggestion: string;
  rationale?: string;
  implementationNotes?: string;
  risk?: string;
  reviewNote?: string;
  reviewedAt?: string;
}

export interface AICheckPromptProgramSuggestion {
  id: string;
  comparisonId: string;
  provider: AICheckEvalRun["provider"];
  model: string;
  items: AICheckPromptProgramSuggestionItem[];
  createdAt: string;
  updatedAt: string;
}

export type AICheckContractChangePlanStatus = "draft" | "ready" | "applied" | "rejected";
export type AICheckContractChangePlanTarget = "prompt" | "rubric" | "schema" | "evaluation";

export interface AICheckContractChangePlanAppliedEvidence {
  contractSourceUpdated: boolean;
  generatedReferencesUpdated: boolean;
  evalCoverageUpdated: boolean;
  linkedDocsUpdated: boolean;
  validationSummary: string;
}

export interface AICheckContractChangePlan {
  id: string;
  suggestionId: string;
  suggestionItemId: string;
  status: AICheckContractChangePlanStatus;
  title: string;
  targets: AICheckContractChangePlanTarget[];
  summary: string;
  requiredSurfaces: string[];
  createdAgainstVersions: {
    promptVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
  };
  implementationNote?: string;
  appliedEvidence?: AICheckContractChangePlanAppliedEvidence;
  appliedVersions?: {
    promptVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
  };
  reviewedAt?: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AICheckReleaseDecisionStatus = "approved" | "blocked";

export interface AICheckReleaseDecision {
  id: string;
  runId: string;
  decision: AICheckReleaseDecisionStatus;
  promptVersion: string;
  outputSchemaVersion: string;
  evaluationSchemaVersion: string;
  providerMode: AICheckEvalRun["providerMode"];
  provider: AICheckEvalRun["provider"];
  model: string;
  releaseGateStatus: AICheckEvalReleaseGate["status"];
  releaseGateReasons: string[];
  metrics: AICheckEvalMetrics;
  note?: string;
  createdAt: string;
}

export type AICheckExperimentStatus = "draft" | "active" | "archived";
export type AICheckExperimentArmKind = "baseline" | "current_prompt" | "candidate_prompt" | "variant";

export interface AICheckExperimentArm {
  id: string;
  name: string;
  kind: AICheckExperimentArmKind;
  promptCandidateId?: string;
  runId?: string;
  notes?: string;
  createdAt: string;
}

export interface AICheckExperiment {
  id: string;
  name: string;
  status: AICheckExperimentStatus;
  notes?: string;
  arms: AICheckExperimentArm[];
  artifactIds: {
    runIds: string[];
    comparisonIds: string[];
    suggestionIds: string[];
    releaseDecisionIds: string[];
    promotionIds: string[];
  };
  createdAt: string;
  updatedAt: string;
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
  | { type: "review/listEvalRuns" }
  | { type: "review/runEvalExperiment"; payload: RunEvalExperimentInput }
  | { type: "review/createEvalJob"; payload: StartEvalJobInput }
  | { type: "review/startEvalJob"; payload: StartEvalJobInput | { jobId: string } }
  | { type: "review/listEvalJobs" }
  | { type: "review/getEvalJob"; payload: { jobId: string } }
  | { type: "review/cancelEvalJob"; payload: { jobId: string } }
  | { type: "review/resumeEvalJob"; payload: { jobId: string } }
  | { type: "review/retryEvalJobCases"; payload: { jobId: string; evalCaseIds?: string[] } }
  | { type: "review/importEvalRunArtifact"; payload: ImportEvalRunArtifactInput }
  | { type: "review/listPromptCandidates" }
  | { type: "review/createPromptCandidate"; payload: CreatePromptCandidateInput }
  | { type: "review/listPromptComparisons" }
  | { type: "review/runPromptComparison"; payload: RunPromptComparisonInput }
  | { type: "review/startPromptComparisonWorkflow"; payload: StartPromptComparisonWorkflowInput }
  | { type: "review/listPromptComparisonWorkflows" }
  | { type: "review/cancelPromptComparisonWorkflow"; payload: { workflowId: string } }
  | { type: "review/generatePromptCandidate"; payload: GeneratePromptCandidateInput }
  | { type: "review/listPromptProgramSuggestions" }
  | { type: "review/generatePromptProgramSuggestions"; payload: GeneratePromptProgramSuggestionsInput }
  | { type: "review/reviewPromptProgramSuggestionItem"; payload: ReviewPromptProgramSuggestionItemInput }
  | { type: "review/listContractChangePlans" }
  | { type: "review/createContractChangePlan"; payload: CreateContractChangePlanInput }
  | { type: "review/updateContractChangePlan"; payload: UpdateContractChangePlanInput }
  | { type: "review/listPromptPromotions" }
  | { type: "review/promotePromptCandidate"; payload: PromotePromptCandidateInput }
  | { type: "review/listReleaseDecisions" }
  | { type: "review/createReleaseDecision"; payload: CreateReleaseDecisionInput }
  | { type: "review/listExperiments" }
  | { type: "review/createExperiment"; payload: CreateExperimentInput }
  | { type: "review/addExperimentArm"; payload: AddExperimentArmInput }
  | { type: "review/linkExperimentArtifact"; payload: LinkExperimentArtifactInput }
  | { type: "settings/update"; payload: Partial<UserSettings> }
  | { type: "provider/saveApiKey"; payload: { provider: ProviderId; apiKey: string } }
  | { type: "provider/deleteApiKey"; payload: { provider: ProviderId } }
  | { type: "provider/status" }
  | { type: "data/export" }
  | { type: "data/deleteAll" };

export interface CreateEvalCaseInput {
  title: string;
  datasetType?: AICheckDatasetType;
  severity?: AICheckSeverity;
  status?: AICheckCaseStatus;
  targetDisplay: string;
  strictness: StrictnessLevel;
  userMessage: string;
  expectedDecision: AIDecision;
  tags: string[];
  reviewerNote?: string;
  userFacingMustMention?: string[];
  userFacingMustNotMention?: string[];
  expectedInputEvidence?: AICheckExpectedInputEvidence;
}

export interface UpdateEvalCaseInput {
  id: string;
  title?: string;
  datasetType?: AICheckDatasetType;
  severity?: AICheckSeverity;
  status?: AICheckCaseStatus;
  targetDisplay?: string;
  strictness?: StrictnessLevel;
  userMessage?: string;
  expectedDecision?: AIDecision;
  tags?: string[];
  reviewerNote?: string;
  userFacingMustMention?: string[];
  userFacingMustNotMention?: string[];
  expectedInputEvidence?: AICheckExpectedInputEvidence;
}

export interface RunEvalExperimentInput {
  filters: AICheckEvalRunFilters;
  mode?: AICheckEvalRunMode;
  provider?: AICheckEvalRun["provider"];
  model?: string;
  experimentId?: string;
  armId?: string;
}

export type StartEvalJobInput = RunEvalExperimentInput;

export interface CreatePromptCandidateInput {
  name: string;
  instructionPatch: string;
  rationale?: string;
}

export interface RunPromptComparisonInput {
  candidateId: string;
  filters: AICheckEvalRunFilters;
  mode?: AICheckEvalRunMode;
  provider?: AICheckEvalRun["provider"];
  model?: string;
  experimentId?: string;
  baselineArmId?: string;
  candidateArmId?: string;
}

export type StartPromptComparisonWorkflowInput = RunPromptComparisonInput;

export interface GeneratePromptCandidateInput {
  comparisonId: string;
  provider?: AICheckEvalRun["provider"];
  model?: string;
}

export interface GeneratePromptProgramSuggestionsInput {
  comparisonId: string;
  provider?: AICheckEvalRun["provider"];
  model?: string;
}

export interface ReviewPromptProgramSuggestionItemInput {
  suggestionId: string;
  itemId: string;
  status: Extract<AICheckPromptProgramSuggestionReviewStatus, "accepted" | "rejected">;
  reviewNote?: string;
}

export interface CreateContractChangePlanInput {
  suggestionId: string;
  itemId: string;
  title?: string;
  summary?: string;
}

export interface UpdateContractChangePlanInput {
  id: string;
  status: Extract<AICheckContractChangePlanStatus, "ready" | "applied" | "rejected">;
  implementationNote?: string;
  appliedEvidence?: AICheckContractChangePlanAppliedEvidence;
}

export interface PromotePromptCandidateInput {
  comparisonId: string;
  note?: string;
}

export interface CreateReleaseDecisionInput {
  runId: string;
  decision: AICheckReleaseDecisionStatus;
  note?: string;
}

export interface CreateExperimentInput {
  name: string;
  notes?: string;
}

export interface AddExperimentArmInput {
  experimentId: string;
  name: string;
  kind: AICheckExperimentArmKind;
  promptCandidateId?: string;
  runId?: string;
  notes?: string;
}

export type AICheckExperimentArtifactKind = "run" | "comparison" | "suggestion" | "release_decision" | "promotion";

export interface LinkExperimentArtifactInput {
  experimentId: string;
  artifactKind: AICheckExperimentArtifactKind;
  artifactId: string;
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
