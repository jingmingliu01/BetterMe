import { AI_CHECK_CURRENT_VERSIONS, AI_CHECK_SESSION_POLICY } from "../shared/ai-check-contract";
import { PROVIDERS } from "../shared/constants";
import { createId, nowIso } from "../shared/id";
import { loadDecryptedApiKey } from "../storage/crypto-key-store";
import { BUILT_IN_AI_CHECK_CASES } from "./built-in-eval-cases";
import { deriveDecisionPointSnapshotFromHistory } from "./decision-point-snapshot";
import { filterEvalCasesForRun, runEvalExperimentForCases } from "./eval-engine";
import type {
  AICheckCase,
  AICheckCaseInput,
  AICheckContractChangePlan,
  AICheckContractChangePlanTarget,
  AICheckDatasetType,
  AICheckDecisionPointSnapshot,
  AICheckExpectedOutput,
  AICheckEvalResult,
  AICheckEvalRun,
  AICheckEvalRunFilters,
  AICheckEvalRunSummary,
  AICheckExperiment,
  AICheckExperimentArtifactKind,
  AICheckExperimentArm,
  AICheckPromptCandidate,
  AICheckPromptComparison,
  AICheckPromptPromotion,
  AICheckPromptProgramSuggestion,
  AICheckPromptProgramSuggestionItem,
  AICheckReleaseDecision,
  AICheckMessage,
  AICheckSession,
  AIDecision,
  AIPMReviewSession,
  BadCaseErrorType,
  BadCaseReview,
  BehaviorEvent,
  BehaviorReasonCategory,
  CheckpointDecision,
  AddExperimentArmInput,
  CreateContractChangePlanInput,
  CreateExperimentInput,
  CreateReleaseDecisionInput,
  CreateEvalCaseInput,
  CreatePromptCandidateInput,
  GeneratePromptCandidateInput,
  GeneratePromptProgramSuggestionsInput,
  ImportEvalRunArtifactInput,
  LinkExperimentArtifactInput,
  PromotePromptCandidateInput,
  ReviewPromptProgramSuggestionItemInput,
  RunEvalExperimentInput,
  RunPromptComparisonInput,
  StrictnessLevel,
  UpdateEvalCaseInput
} from "../shared/types";
import { getAllRecords, getRecord, putRecord } from "../storage/indexed-db";
import { requestProviderJsonObject } from "./provider-client";

export const AI_CHECK_PROMPT_VERSION = AI_CHECK_CURRENT_VERSIONS.promptVersion;
export const AI_CHECK_OUTPUT_SCHEMA_VERSION = AI_CHECK_CURRENT_VERSIONS.outputSchemaVersion;
export const AI_CHECK_EVALUATION_SCHEMA_VERSION = AI_CHECK_CURRENT_VERSIONS.evaluationSchemaVersion;

export async function listReviewSessions(): Promise<AIPMReviewSession[]> {
  const [sessions, messages, decisions, badCases, behaviorEvents] = await Promise.all([
    getAllRecords<AICheckSession>("aiCheckSessions"),
    getAllRecords<AICheckMessage>("aiCheckMessages"),
    getAllRecords<CheckpointDecision>("checkpointDecisions"),
    getAllRecords<BadCaseReview>("badCaseReviews"),
    getAllRecords<BehaviorEvent>("behaviorEvents")
  ]);

  return sessions
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, 50)
    .map((session) => {
      const sessionMessages = messages
        .filter((message) => message.sessionId === session.id)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const sessionDecisions = decisions
        .filter((decision) => decision.sessionId === session.id)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      const sessionBadCases = badCases
        .filter((item) => item.sourceSessionId === session.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      return {
        session: {
          ...session,
          strictness: session.strictness ?? getStrictnessFromEvents(session.id, behaviorEvents) ?? undefined
        },
        messages: sessionMessages,
        decisions: sessionDecisions,
        badCases: sessionBadCases,
        badCase: sessionBadCases[0] ?? null
      };
    });
}

export async function createBadCaseReview(input: {
  sessionId: string;
  decisionId?: string | null;
  expectedDecision?: AIDecision | null;
  errorTypes: BadCaseErrorType[];
  reviewerNote: string;
}): Promise<BadCaseReview> {
  const session = await getRecord<AICheckSession>("aiCheckSessions", input.sessionId);
  if (!session) {
    throw new Error("AI Check session not found.");
  }
  const [messages, decisions, decisionPoints, behaviorEvents] = await Promise.all([
    getAllRecords<AICheckMessage>("aiCheckMessages"),
    getAllRecords<CheckpointDecision>("checkpointDecisions"),
    getAllRecords<AICheckDecisionPointSnapshot>("aiCheckDecisionPoints"),
    getAllRecords<BehaviorEvent>("behaviorEvents")
  ]);
  const sessionMessages = messages
    .filter((message) => message.sessionId === session.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const sessionDecisions = decisions
    .filter((decision) => decision.sessionId === session.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const decision =
    (input.decisionId ? sessionDecisions.find((item) => item.id === input.decisionId) : null) ??
    sessionDecisions.at(-1) ??
    null;
  const persistedSnapshot = decision ? decisionPoints.find((item) => item.decisionId === decision.id) ?? null : null;
  const snapshot = deriveDecisionPointSnapshotFromHistory({
    session,
    messages: sessionMessages,
    decisions: sessionDecisions,
    decision
  });
  const now = nowIso();
  const review: BadCaseReview = {
    id: createId("badcase"),
    sourceSessionId: session.id,
    sourceDecisionId: decision?.id ?? null,
    selectedAssistantMessageId: persistedSnapshot?.selectedAssistantMessageId ?? snapshot.selectedAssistantMessageId,
    triggeringUserMessageId: persistedSnapshot?.triggeringUserMessageId ?? snapshot.triggeringUserMessageId,
    decisionOrdinal: snapshot.decisionOrdinal,
    targetDisplay: session.targetDisplay,
    strictness: session.strictness ?? getStrictnessFromEvents(session.id, behaviorEvents),
    messages: snapshot.messages,
    inputSnapshot: persistedSnapshot?.input ?? snapshot.input,
    output: persistedSnapshot?.actualOutput ?? snapshot.actualOutput,
    actualDecision: decision?.decision ?? session.finalDecision ?? null,
    expectedDecision: input.expectedDecision ?? null,
    errorTypes: input.errorTypes,
    reviewerNote: input.reviewerNote.trim(),
    createdAt: now,
    updatedAt: now
  };
  await putRecord("badCaseReviews", review);
  return review;
}

export async function updateBadCaseReview(input: {
  id: string;
  expectedDecision?: AIDecision | null;
  errorTypes?: BadCaseErrorType[];
  reviewerNote?: string;
}): Promise<BadCaseReview> {
  const existing = await getRecord<BadCaseReview>("badCaseReviews", input.id);
  if (!existing) {
    throw new Error("Bad case not found.");
  }
  const next: BadCaseReview = {
    ...existing,
    expectedDecision: input.expectedDecision !== undefined ? input.expectedDecision : existing.expectedDecision,
    errorTypes: input.errorTypes ?? existing.errorTypes,
    reviewerNote: input.reviewerNote !== undefined ? input.reviewerNote.trim() : existing.reviewerNote,
    updatedAt: nowIso()
  };
  await putRecord("badCaseReviews", next);
  return next;
}

export async function convertBadCaseToEvalCase(input: { badCaseId: string; title?: string }): Promise<AICheckCase> {
  const badCase = await getRecord<BadCaseReview>("badCaseReviews", input.badCaseId);
  if (!badCase) {
    throw new Error("Bad case not found.");
  }
  if (!badCase.expectedDecision) {
    throw new Error("Choose an expected decision before converting to an eval case.");
  }
  const now = nowIso();
  const strictness = badCase.strictness ?? "balanced";
  const evalCase: AICheckCase = {
    id: createId("eval"),
    title: input.title?.trim() || buildEvalTitle(badCase),
    datasetType: "regression",
    provenance: {
      type: "review",
      reviewId: badCase.id,
      sessionId: badCase.sourceSessionId,
      ...(badCase.sourceDecisionId ? { decisionId: badCase.sourceDecisionId } : {})
    },
    versions: {
      promptVersion: AI_CHECK_PROMPT_VERSION,
      outputSchemaVersion: AI_CHECK_OUTPUT_SCHEMA_VERSION,
      evaluationSchemaVersion: AI_CHECK_EVALUATION_SCHEMA_VERSION
    },
    input:
      badCase.inputSnapshot ??
      buildFallbackCaseInput({
        targetDisplay: badCase.targetDisplay,
        strictness,
        messages: badCase.messages
      }),
    output: badCase.output,
    eval: {
      expectedOutput: {
        decision: badCase.expectedDecision
      },
      tags: badCase.errorTypes,
      reviewerNote: badCase.reviewerNote
    },
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
  await putRecord("evalCases", evalCase);
  await putRecord("badCaseReviews", {
    ...badCase,
    convertedEvalCaseId: evalCase.id,
    updatedAt: now
  });
  return evalCase;
}

export async function listEvalCases(): Promise<AICheckCase[]> {
  const cases = await getAllRecords<AICheckCase>("evalCases");
  const normalized = cases.map(normalizeStoredEvalCase);
  await Promise.all(
    normalized
      .filter((item, index) => item !== cases[index])
      .map((item) => putRecord("evalCases", item))
  );
  return mergeEvalCases(normalized).sort(compareEvalCases);
}

export async function createEvalCase(input: CreateEvalCaseInput): Promise<AICheckCase> {
  const now = nowIso();
  const evalCase = normalizeStoredEvalCase({
    id: createId("eval"),
    title: input.title.trim() || "Untitled evaluation case",
    datasetType: input.datasetType ?? "design",
    provenance: {
      type: "authored"
    },
    versions: {
      promptVersion: AI_CHECK_PROMPT_VERSION,
      outputSchemaVersion: AI_CHECK_OUTPUT_SCHEMA_VERSION,
      evaluationSchemaVersion: AI_CHECK_EVALUATION_SCHEMA_VERSION
    },
    input: {
      targetDisplay: input.targetDisplay.trim() || "example.com",
      strictness: input.strictness,
      sessionContext: {
        assistantTurnCount: 0,
        maxAssistantTurns: AI_CHECK_SESSION_POLICY.maxAssistantTurns,
        isFinalTurn: false
      },
      messages: [
        {
          role: "user",
          content: input.userMessage.trim() || "I need to open this for a specific task.",
          source: "user"
        }
      ],
      patternMemorySnapshot: []
    },
    eval: {
      expectedOutput: {
        decision: input.expectedDecision,
        ...buildUserFacingExpectation(input.userFacingMustMention, input.userFacingMustNotMention)
      },
      tags: cleanList(input.tags),
      reviewerNote: input.reviewerNote?.trim() || undefined
    },
    severity: input.severity,
    status: input.status ?? "draft",
    createdAt: now,
    updatedAt: now
  });
  await putRecord("evalCases", evalCase);
  return evalCase;
}

export async function updateEvalCase(input: UpdateEvalCaseInput): Promise<AICheckCase> {
  const existing = await getEvalCaseById(input.id);
  if (!existing) {
    throw new Error("Eval case not found.");
  }
  const current = normalizeStoredEvalCase(existing);
  const messages = current.input.messages.length > 0 ? [...current.input.messages] : [];
  if (input.userMessage !== undefined) {
    const userIndex = messages.findIndex((message) => message.role === "user");
    const nextUserMessage = {
      role: "user" as const,
      content: input.userMessage.trim(),
      source: "user" as const
    };
    if (userIndex >= 0) {
      messages[userIndex] = {
        ...messages[userIndex],
        ...nextUserMessage
      };
    } else {
      messages.push(nextUserMessage);
    }
  }

  const next: AICheckCase = normalizeStoredEvalCase({
    ...current,
    title: input.title !== undefined ? input.title.trim() || current.title : current.title,
    datasetType: input.datasetType ?? current.datasetType,
    severity: input.severity ?? current.severity,
    status: input.status ?? current.status,
    input: {
      ...current.input,
      targetDisplay: input.targetDisplay !== undefined ? input.targetDisplay.trim() || current.input.targetDisplay : current.input.targetDisplay,
      strictness: input.strictness ?? current.input.strictness,
      messages
    },
    eval: {
      expectedOutput: {
        ...(current.eval?.expectedOutput ?? { decision: "ASK_MORE" }),
        decision: input.expectedDecision ?? current.eval?.expectedOutput.decision ?? "ASK_MORE",
        ...buildUserFacingExpectation(
          input.userFacingMustMention,
          input.userFacingMustNotMention,
          current.eval?.expectedOutput.userFacingMessage
        )
      },
      tags: input.tags !== undefined ? cleanList(input.tags) : current.eval?.tags ?? [],
      reviewerNote:
        input.reviewerNote !== undefined ? input.reviewerNote.trim() || undefined : current.eval?.reviewerNote
    },
    archivedAt:
      input.status === "archived"
        ? current.archivedAt ?? nowIso()
        : input.status
          ? undefined
          : current.archivedAt,
    archivedReason: input.status && input.status !== "archived" ? undefined : current.archivedReason,
    updatedAt: nowIso()
  });
  await putRecord("evalCases", next);
  return next;
}

export async function archiveEvalCase(input: { id: string; archivedReason?: string }): Promise<AICheckCase> {
  const existing = await getEvalCaseById(input.id);
  if (!existing) {
    throw new Error("Eval case not found.");
  }
  const now = nowIso();
  const next: AICheckCase = {
    ...normalizeStoredEvalCase(existing),
    status: "archived",
    archivedAt: now,
    archivedReason: input.archivedReason?.trim() || "Archived from PM Review.",
    updatedAt: now
  };
  await putRecord("evalCases", next);
  return next;
}

export async function saveEvalRun(run: AICheckEvalRun): Promise<void> {
  await putRecord("evalRuns", run);
}

export async function saveEvalResult(result: AICheckEvalResult): Promise<void> {
  await putRecord("evalResults", result);
}

export async function listEvalRunSummaries(): Promise<AICheckEvalRunSummary[]> {
  const [runs, results] = await Promise.all([
    getAllRecords<AICheckEvalRun>("evalRuns"),
    getAllRecords<AICheckEvalResult>("evalResults")
  ]);
  return runs
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((run) => ({
      run,
      results: results.filter((result) => result.runId === run.id)
    }));
}

export async function importEvalRunArtifact(input: ImportEvalRunArtifactInput): Promise<AICheckEvalRunSummary> {
  const summary = input.artifact;
  validateEvalRunArtifact(summary);
  await saveEvalRun(summary.run);
  await Promise.all(summary.results.map((result) => saveEvalResult(result)));
  return summary;
}

export async function listPromptCandidates(): Promise<AICheckPromptCandidate[]> {
  const candidates = await getAllRecords<AICheckPromptCandidate>("promptCandidates");
  return candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createPromptCandidate(input: CreatePromptCandidateInput): Promise<AICheckPromptCandidate> {
  const instructionPatch = input.instructionPatch.trim();
  if (!instructionPatch) {
    throw new Error("Candidate prompt patch is required.");
  }
  const now = nowIso();
  const candidate: AICheckPromptCandidate = {
    id: createId("promptcandidate"),
    name: input.name.trim() || "Untitled candidate prompt",
    status: "draft",
    instructionPatch,
    rationale: input.rationale?.trim() || undefined,
    createdAt: now,
    updatedAt: now
  };
  await putRecord("promptCandidates", candidate);
  return candidate;
}

export async function listPromptComparisons(): Promise<AICheckPromptComparison[]> {
  const comparisons = await getAllRecords<AICheckPromptComparison>("promptComparisons");
  return comparisons.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listPromptPromotions(): Promise<AICheckPromptPromotion[]> {
  const promotions = await getAllRecords<AICheckPromptPromotion>("promptPromotions");
  return promotions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listPromptProgramSuggestions(): Promise<AICheckPromptProgramSuggestion[]> {
  const suggestions = await getAllRecords<AICheckPromptProgramSuggestion>("promptProgramSuggestions");
  return suggestions.sort((left, right) => (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt));
}

export async function listContractChangePlans(): Promise<AICheckContractChangePlan[]> {
  const plans = await getAllRecords<AICheckContractChangePlan>("contractChangePlans");
  return plans.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getActivePromptPromotion(): Promise<AICheckPromptPromotion | null> {
  return (await listPromptPromotions())[0] ?? null;
}

export async function getPromptPromotionByVersion(promptVersion: string | undefined): Promise<AICheckPromptPromotion | null> {
  if (!promptVersion) return null;
  const promotions = await getAllRecords<AICheckPromptPromotion>("promptPromotions");
  return promotions.find((promotion) => promotion.promptVersion === promptVersion) ?? null;
}

export async function runPromptComparison(input: RunPromptComparisonInput): Promise<AICheckPromptComparison> {
  const candidate = await getRecord<AICheckPromptCandidate>("promptCandidates", input.candidateId);
  if (!candidate || candidate.status === "archived") {
    throw new Error("Prompt candidate not found.");
  }
  const provider = input.provider ?? "mock";
  if (provider === "mock") {
    throw new Error("Candidate Prompt A/B requires a BYOK provider so the prompt patch can affect model behavior.");
  }
  const providerConfig = PROVIDERS.find((item) => item.id === provider);
  const model = input.model ?? providerConfig?.defaultModel ?? "mock";
  if (!providerConfig) {
    throw new Error("Unknown provider.");
  }
  if (!providerConfig.models.includes(model)) {
    throw new Error("Selected model is not available for this provider.");
  }
  const apiKey = await loadDecryptedApiKey(providerConfig.id);
  if (!apiKey) {
    throw new Error(`Save a ${providerConfig.label} API key before running Candidate Prompt A/B.`);
  }

  const cases = await listEvalCases();
  const selectedCases = filterEvalCasesForRun(cases, input.filters);
  if (selectedCases.length === 0) {
    throw new Error("No evaluation cases match this comparison filter.");
  }

  const baselineSummary = await runEvalExperimentForCases(cases, {
    filters: input.filters,
    mode: input.mode ?? "tuning",
    provider,
    model,
    apiKey
  });
  const candidateSummary = await runEvalExperimentForCases(cases, {
    filters: input.filters,
    mode: input.mode ?? "tuning",
    provider,
    model,
    apiKey,
    promptVersion: `${AI_CHECK_PROMPT_VERSION}+candidate:${candidate.id}`,
    systemPromptAddendum: candidate.instructionPatch
  });
  await saveEvalRun(baselineSummary.run);
  await Promise.all(baselineSummary.results.map((result) => saveEvalResult(result)));
  await saveEvalRun(candidateSummary.run);
  await Promise.all(candidateSummary.results.map((result) => saveEvalResult(result)));

  const comparison = buildPromptComparison({
    candidate,
    filters: input.filters,
    selectedCases,
    baselineSummary,
    candidateSummary
  });
  await putRecord("promptComparisons", comparison);
  return comparison;
}

export async function generatePromptCandidate(input: GeneratePromptCandidateInput): Promise<AICheckPromptCandidate> {
  const comparison = await getRecord<AICheckPromptComparison>("promptComparisons", input.comparisonId);
  if (!comparison) {
    throw new Error("Prompt comparison not found.");
  }
  const provider = input.provider ?? comparison.provider;
  if (provider === "mock") {
    throw new Error("Prompt candidate generation requires a BYOK provider.");
  }
  const providerConfig = PROVIDERS.find((item) => item.id === provider);
  const model = input.model ?? providerConfig?.defaultModel ?? comparison.model;
  if (!providerConfig) {
    throw new Error("Unknown provider.");
  }
  if (!providerConfig.models.includes(model)) {
    throw new Error("Selected model is not available for this provider.");
  }
  const apiKey = await loadDecryptedApiKey(providerConfig.id);
  if (!apiKey) {
    throw new Error(`Save a ${providerConfig.label} API key before generating candidates.`);
  }
  const raw = await requestProviderJsonObject({
    provider,
    model,
    apiKey,
    messages: buildCandidateGenerationMessages(comparison)
  });
  const generated = parseGeneratedCandidate(raw);
  return createPromptCandidate({
    name: generated.name,
    instructionPatch: generated.instructionPatch,
    rationale: generated.rationale
  });
}

export async function generatePromptProgramSuggestions(
  input: GeneratePromptProgramSuggestionsInput
): Promise<AICheckPromptProgramSuggestion> {
  const comparison = await getRecord<AICheckPromptComparison>("promptComparisons", input.comparisonId);
  if (!comparison) {
    throw new Error("Prompt comparison not found.");
  }
  const provider = input.provider ?? comparison.provider;
  if (provider === "mock") {
    throw new Error("Prompt Program suggestion generation requires a BYOK provider.");
  }
  const providerConfig = PROVIDERS.find((item) => item.id === provider);
  const model = input.model ?? providerConfig?.defaultModel ?? comparison.model;
  if (!providerConfig) {
    throw new Error("Unknown provider.");
  }
  if (!providerConfig.models.includes(model)) {
    throw new Error("Selected model is not available for this provider.");
  }
  const apiKey = await loadDecryptedApiKey(providerConfig.id);
  if (!apiKey) {
    throw new Error(`Save a ${providerConfig.label} API key before generating Prompt Program suggestions.`);
  }
  const raw = await requestProviderJsonObject({
    provider,
    model,
    apiKey,
    messages: buildPromptProgramSuggestionMessages(comparison)
  });
  const createdAt = nowIso();
  const suggestion: AICheckPromptProgramSuggestion = {
    id: createId("promptprogramsuggestion"),
    comparisonId: comparison.id,
    provider,
    model,
    items: parseGeneratedPromptProgramSuggestions(raw),
    createdAt,
    updatedAt: createdAt
  };
  await putRecord("promptProgramSuggestions", suggestion);
  return suggestion;
}

export async function reviewPromptProgramSuggestionItem(
  input: ReviewPromptProgramSuggestionItemInput
): Promise<AICheckPromptProgramSuggestion> {
  const suggestion = await getRecord<AICheckPromptProgramSuggestion>("promptProgramSuggestions", input.suggestionId);
  if (!suggestion) {
    throw new Error("Prompt Program suggestion not found.");
  }
  let itemFound = false;
  const reviewedAt = nowIso();
  const updated: AICheckPromptProgramSuggestion = {
    ...suggestion,
    items: suggestion.items.map((item) => {
      if (item.id !== input.itemId) return item;
      itemFound = true;
      return {
        ...item,
        status: input.status,
        reviewNote: input.reviewNote?.trim() || undefined,
        reviewedAt
      };
    }),
    updatedAt: reviewedAt
  };
  if (!itemFound) {
    throw new Error("Prompt Program suggestion item not found.");
  }
  await putRecord("promptProgramSuggestions", updated);
  return updated;
}

export async function createContractChangePlan(input: CreateContractChangePlanInput): Promise<AICheckContractChangePlan> {
  const suggestion = await getRecord<AICheckPromptProgramSuggestion>("promptProgramSuggestions", input.suggestionId);
  if (!suggestion) {
    throw new Error("Prompt Program suggestion not found.");
  }
  const item = suggestion.items.find((candidate) => candidate.id === input.itemId);
  if (!item) {
    throw new Error("Prompt Program suggestion item not found.");
  }
  if (item.status !== "accepted") {
    throw new Error("Only accepted suggestions can become contract change plans.");
  }
  const existingPlans = await listContractChangePlans();
  const existingPlan = existingPlans.find(
    (plan) => plan.suggestionId === suggestion.id && plan.suggestionItemId === item.id
  );
  if (existingPlan) {
    return existingPlan;
  }
  const createdAt = nowIso();
  const targets = deriveContractChangeTargets(item.kind);
  const plan: AICheckContractChangePlan = {
    id: createId("contractchangeplan"),
    suggestionId: suggestion.id,
    suggestionItemId: item.id,
    status: "draft",
    title: input.title?.trim() || item.title,
    targets,
    summary: input.summary?.trim() || item.suggestion,
    requiredSurfaces: buildContractChangeRequiredSurfaces(targets),
    createdAt,
    updatedAt: createdAt
  };
  await putRecord("contractChangePlans", plan);
  return plan;
}

export async function promotePromptCandidate(input: PromotePromptCandidateInput): Promise<AICheckPromptPromotion> {
  const comparison = await getRecord<AICheckPromptComparison>("promptComparisons", input.comparisonId);
  if (!comparison) {
    throw new Error("Prompt comparison not found.");
  }
  if (comparison.recommendation !== "promote_candidate") {
    throw new Error("Only comparisons recommended for promotion can be promoted.");
  }
  if (comparison.regressedCaseIds.length > 0) {
    throw new Error("Cannot promote a candidate with regressed cases.");
  }
  if (comparison.candidateMetrics.releaseGate.status === "fail") {
    throw new Error("Cannot promote a candidate when the candidate release gate failed.");
  }
  if (comparison.promotionGate.status !== "pass") {
    throw new Error(`Cannot promote this candidate: ${comparison.promotionGate.reasons.join(" ")}`);
  }
  const candidate = await getRecord<AICheckPromptCandidate>("promptCandidates", comparison.candidateId);
  if (!candidate || candidate.status === "archived") {
    throw new Error("Prompt candidate not found.");
  }
  const createdAt = nowIso();
  const promotion: AICheckPromptPromotion = {
    id: createId("promptpromotion"),
    candidateId: candidate.id,
    comparisonId: comparison.id,
    promptVersion: `${AI_CHECK_PROMPT_VERSION}+promotion:${candidate.id}:${createdAt.replace(/[-:.TZ]/g, "")}`,
    baselineRunId: comparison.baselineRunId,
    candidateRunId: comparison.candidateRunId,
    instructionPatch: candidate.instructionPatch,
    note: input.note?.trim() || undefined,
    createdAt
  };
  await putRecord("promptPromotions", promotion);
  return promotion;
}

function buildCandidateGenerationMessages(comparison: AICheckPromptComparison): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "You are helping improve BetterMe's AI Check Prompt Program.",
        "Return exactly one raw JSON object with keys: name, instructionPatch, rationale.",
        "Do not include Markdown.",
        "The instructionPatch must be concise, actionable, and safe to append inside <candidate_prompt_patch>.",
        "Do not quote or reveal hidden Holdout case details. Use only aggregate diagnosis and directions."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: "Draft a new candidate prompt patch from this Textual Gradient.",
          recommendation: comparison.recommendation,
          metrics: {
            baselinePassRate: comparison.baselineMetrics.passRate,
            candidatePassRate: comparison.candidateMetrics.passRate,
            improvedCases: comparison.improvedCaseIds.length,
            regressedCases: comparison.regressedCaseIds.length
          },
          promotionGate: comparison.promotionGate,
          textualGradient: comparison.textualGradient,
          outputShape: {
            name: "Short candidate name",
            instructionPatch: "Append-only prompt instructions. No schema changes.",
            rationale: "Why this candidate should address the failure pattern."
          }
        },
        null,
        2
      )
    }
  ];
}

function buildPromptProgramSuggestionMessages(
  comparison: AICheckPromptComparison
): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content: [
        "You are helping improve BetterMe's full AI Check Prompt Program.",
        "Return exactly one raw JSON object with key: items.",
        "items must be an array of 1 to 6 suggestions.",
        "Each item must include: kind, title, suggestion, rationale, implementationNotes, risk.",
        'kind must be one of "prompt_patch", "rubric", or "schema".',
        "Prompt patch items are draft instructions only; schema and rubric items are product-design suggestions only.",
        "Do not include Markdown.",
        "Do not quote or reveal hidden Holdout case details. Use only aggregate diagnosis and directions."
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task:
            "Draft richer Prompt Program suggestions from this Textual Gradient, covering prompt patches, policy/rubric clarifications, and schema/evaluation gaps when useful.",
          recommendation: comparison.recommendation,
          metrics: {
            baselinePassRate: comparison.baselineMetrics.passRate,
            candidatePassRate: comparison.candidateMetrics.passRate,
            improvedCases: comparison.improvedCaseIds.length,
            regressedCases: comparison.regressedCaseIds.length,
            unchangedFailedCases: comparison.unchangedFailedCaseIds.length
          },
          promotionGate: comparison.promotionGate,
          textualGradient: comparison.textualGradient,
          outputShape: {
            items: [
              {
                kind: "rubric",
                title: "Short suggestion title",
                suggestion: "Concrete rubric, prompt, schema, or evaluation improvement.",
                rationale: "Why this addresses the observed failure pattern.",
                implementationNotes: "Where a PM or engineer should apply the suggestion.",
                risk: "Possible overfit, contract drift, or product-risk concern."
              }
            ]
          }
        },
        null,
        2
      )
    }
  ];
}

function parseGeneratedCandidate(raw: string): CreatePromptCandidateInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Provider returned invalid candidate JSON.");
  }
  const candidate = parsed as Partial<CreatePromptCandidateInput>;
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.instructionPatch !== "string" ||
    candidate.instructionPatch.trim().length === 0
  ) {
    throw new Error("Provider candidate JSON must include name and instructionPatch.");
  }
  return {
    name: candidate.name.slice(0, 120),
    instructionPatch: candidate.instructionPatch.trim(),
    rationale: typeof candidate.rationale === "string" ? candidate.rationale.trim() : undefined
  };
}

function parseGeneratedPromptProgramSuggestions(raw: string): AICheckPromptProgramSuggestionItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Provider returned invalid Prompt Program suggestion JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { items?: unknown }).items)) {
    throw new Error("Provider suggestion JSON must include an items array.");
  }
  const items = (parsed as { items: unknown[] }).items.slice(0, 6).map(parsePromptProgramSuggestionItem);
  if (items.length === 0) {
    throw new Error("Provider suggestion JSON must include at least one suggestion item.");
  }
  return items;
}

function parsePromptProgramSuggestionItem(raw: unknown): AICheckPromptProgramSuggestionItem {
  if (!raw || typeof raw !== "object") {
    throw new Error("Each Prompt Program suggestion item must be an object.");
  }
  const item = raw as Partial<Record<keyof AICheckPromptProgramSuggestionItem, unknown>>;
  const kind = item.kind;
  if (kind !== "prompt_patch" && kind !== "rubric" && kind !== "schema") {
    throw new Error("Prompt Program suggestion kind must be prompt_patch, rubric, or schema.");
  }
  if (typeof item.title !== "string" || typeof item.suggestion !== "string" || item.suggestion.trim().length === 0) {
    throw new Error("Prompt Program suggestion items must include title and suggestion.");
  }
  return {
    id: createId("promptprogramsuggestionitem"),
    kind,
    status: "proposed",
    title: item.title.trim().slice(0, 120) || formatSuggestionKind(kind),
    suggestion: item.suggestion.trim(),
    rationale: typeof item.rationale === "string" ? item.rationale.trim() : undefined,
    implementationNotes: typeof item.implementationNotes === "string" ? item.implementationNotes.trim() : undefined,
    risk: typeof item.risk === "string" ? item.risk.trim() : undefined
  };
}

function formatSuggestionKind(kind: AICheckPromptProgramSuggestionItem["kind"]): string {
  return kind.replace(/_/g, " ");
}

function deriveContractChangeTargets(
  kind: AICheckPromptProgramSuggestionItem["kind"]
): AICheckContractChangePlanTarget[] {
  if (kind === "prompt_patch") return ["prompt"];
  if (kind === "rubric") return ["rubric", "evaluation"];
  return ["schema", "evaluation"];
}

function buildContractChangeRequiredSurfaces(targets: AICheckContractChangePlanTarget[]): string[] {
  const surfaces = [
    "apps/extension/src/shared/ai-check-contract.json",
    "generated AI Check contract references",
    "AI Check eval assertions or fixtures",
    "linked design/progress/issues docs"
  ];
  if (targets.includes("schema")) {
    surfaces.splice(2, 0, "generated TypeScript/parser constraints");
  }
  if (targets.includes("prompt")) {
    surfaces.splice(1, 0, "runtime provider message builder and prompt version registry");
  }
  return surfaces;
}

export async function listReleaseDecisions(): Promise<AICheckReleaseDecision[]> {
  const decisions = await getAllRecords<AICheckReleaseDecision>("releaseDecisions");
  return decisions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createReleaseDecision(input: CreateReleaseDecisionInput): Promise<AICheckReleaseDecision> {
  const run = await getRecord<AICheckEvalRun>("evalRuns", input.runId);
  if (!run) {
    throw new Error("Eval run not found.");
  }
  if (input.decision === "approved" && run.metrics.releaseGate.status === "fail") {
    throw new Error("Cannot approve a release when the release gate failed.");
  }
  const createdAt = nowIso();
  const decision: AICheckReleaseDecision = {
    id: createId("release"),
    runId: run.id,
    decision: input.decision,
    promptVersion: run.promptVersion,
    outputSchemaVersion: run.outputSchemaVersion,
    evaluationSchemaVersion: run.evaluationSchemaVersion,
    providerMode: run.providerMode,
    provider: run.provider,
    model: run.model,
    releaseGateStatus: run.metrics.releaseGate.status,
    releaseGateReasons: run.metrics.releaseGate.reasons,
    metrics: run.metrics,
    note: input.note?.trim() || undefined,
    createdAt
  };
  await putRecord("releaseDecisions", decision);
  return decision;
}

export async function listExperiments(): Promise<AICheckExperiment[]> {
  const experiments = await getAllRecords<AICheckExperiment>("experiments");
  return experiments.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function createExperiment(input: CreateExperimentInput): Promise<AICheckExperiment> {
  const now = nowIso();
  const experiment: AICheckExperiment = {
    id: createId("experiment"),
    name: input.name.trim() || "Untitled experiment",
    status: "active",
    notes: input.notes?.trim() || undefined,
    arms: [],
    artifactIds: {
      runIds: [],
      comparisonIds: [],
      suggestionIds: [],
      releaseDecisionIds: [],
      promotionIds: []
    },
    createdAt: now,
    updatedAt: now
  };
  await putRecord("experiments", experiment);
  return experiment;
}

export async function addExperimentArm(input: AddExperimentArmInput): Promise<AICheckExperiment> {
  const experiment = await getRecord<AICheckExperiment>("experiments", input.experimentId);
  if (!experiment) {
    throw new Error("Experiment not found.");
  }
  if (input.promptCandidateId) {
    const candidate = await getRecord<AICheckPromptCandidate>("promptCandidates", input.promptCandidateId);
    if (!candidate || candidate.status === "archived") {
      throw new Error("Prompt candidate not found.");
    }
  }
  if (input.runId) {
    const run = await getRecord<AICheckEvalRun>("evalRuns", input.runId);
    if (!run) {
      throw new Error("Eval run not found.");
    }
  }
  const createdAt = nowIso();
  const arm: AICheckExperimentArm = {
    id: createId("experimentarm"),
    name: input.name.trim() || formatExperimentArmKind(input.kind),
    kind: input.kind,
    promptCandidateId: input.promptCandidateId || undefined,
    runId: input.runId || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt
  };
  const updated: AICheckExperiment = {
    ...experiment,
    arms: [...(experiment.arms ?? []), arm],
    updatedAt: createdAt
  };
  await putRecord("experiments", updated);
  return updated;
}

export async function linkExperimentArtifact(input: LinkExperimentArtifactInput): Promise<AICheckExperiment> {
  const experiment = await getRecord<AICheckExperiment>("experiments", input.experimentId);
  if (!experiment) {
    throw new Error("Experiment not found.");
  }
  await assertExperimentArtifactExists(input.artifactKind, input.artifactId);
  const updated: AICheckExperiment = {
    ...experiment,
    artifactIds: addExperimentArtifactId(experiment.artifactIds, input.artifactKind, input.artifactId),
    updatedAt: nowIso()
  };
  await putRecord("experiments", updated);
  return updated;
}

function formatExperimentArmKind(kind: AICheckExperimentArm["kind"]): string {
  return kind.replace(/_/g, " ");
}

async function assertExperimentArtifactExists(kind: AICheckExperimentArtifactKind, id: string): Promise<void> {
  const storeByKind = {
    run: "evalRuns",
    comparison: "promptComparisons",
    suggestion: "promptProgramSuggestions",
    release_decision: "releaseDecisions",
    promotion: "promptPromotions"
  } as const;
  const record = await getRecord(storeByKind[kind], id);
  if (!record) {
    throw new Error("Experiment artifact not found.");
  }
}

function addExperimentArtifactId(
  artifactIds: AICheckExperiment["artifactIds"],
  kind: AICheckExperimentArtifactKind,
  id: string
): AICheckExperiment["artifactIds"] {
  const keyByKind = {
    run: "runIds",
    comparison: "comparisonIds",
    suggestion: "suggestionIds",
    release_decision: "releaseDecisionIds",
    promotion: "promotionIds"
  } as const;
  const key = keyByKind[kind];
  return {
    ...artifactIds,
    [key]: [...new Set([...artifactIds[key], id])]
  };
}

export async function runEvalExperiment(input: RunEvalExperimentInput): Promise<AICheckEvalRunSummary> {
  const cases = await listEvalCases();
  const provider = input.provider ?? "mock";
  const providerConfig = provider === "mock" ? null : PROVIDERS.find((item) => item.id === provider);
  const model = input.model ?? providerConfig?.defaultModel ?? "mock";
  if (providerConfig && !providerConfig.models.includes(model)) {
    throw new Error("Selected model is not available for this provider.");
  }
  const apiKey = providerConfig ? await loadDecryptedApiKey(providerConfig.id) : undefined;
  if (providerConfig && !apiKey) {
    throw new Error(`Save a ${providerConfig.label} API key before running provider-mode evals.`);
  }
  const summary = await runEvalExperimentForCases(cases, {
    filters: input.filters,
    mode: input.mode ?? "tuning",
    provider,
    model,
    apiKey: apiKey ?? undefined
  });
  await saveEvalRun(summary.run);
  await Promise.all(summary.results.map((result) => saveEvalResult(result)));
  return summary;
}

function buildPromptComparison(input: {
  candidate: AICheckPromptCandidate;
  filters: AICheckEvalRunFilters;
  selectedCases: AICheckCase[];
  baselineSummary: AICheckEvalRunSummary;
  candidateSummary: AICheckEvalRunSummary;
}): AICheckPromptComparison {
  const baselineByCaseId = new Map(input.baselineSummary.results.map((result) => [result.evalCaseId, result]));
  const candidateByCaseId = new Map(input.candidateSummary.results.map((result) => [result.evalCaseId, result]));
  const improvedCaseIds: string[] = [];
  const regressedCaseIds: string[] = [];
  const unchangedFailedCaseIds: string[] = [];
  const unchangedPassedCaseIds: string[] = [];

  for (const testCase of input.selectedCases) {
    const baseline = baselineByCaseId.get(testCase.id);
    const candidate = candidateByCaseId.get(testCase.id);
    if (!baseline || !candidate) continue;
    if (!baseline.pass && candidate.pass) {
      improvedCaseIds.push(testCase.id);
    } else if (baseline.pass && !candidate.pass) {
      regressedCaseIds.push(testCase.id);
    } else if (!baseline.pass && !candidate.pass) {
      unchangedFailedCaseIds.push(testCase.id);
    } else {
      unchangedPassedCaseIds.push(testCase.id);
    }
  }

  const promotionGate = buildPromotionGate(input.selectedCases, input.candidateSummary.results);
  const recommendation =
    regressedCaseIds.length > 0 ||
    input.candidateSummary.run.metrics.releaseGate.status === "fail" ||
    promotionGate.status === "fail"
      ? "reject_candidate"
      : improvedCaseIds.length > 0 &&
          input.candidateSummary.run.metrics.passRate >= input.baselineSummary.run.metrics.passRate
        ? "promote_candidate"
        : "revise_candidate";

  return {
    id: createId("promptcomparison"),
    candidateId: input.candidate.id,
    baselineRunId: input.baselineSummary.run.id,
    candidateRunId: input.candidateSummary.run.id,
    mode: input.candidateSummary.run.mode,
    provider: input.candidateSummary.run.provider,
    model: input.candidateSummary.run.model,
    filters: input.filters,
    baselineMetrics: input.baselineSummary.run.metrics,
    candidateMetrics: input.candidateSummary.run.metrics,
    improvedCaseIds,
    regressedCaseIds,
    unchangedFailedCaseIds,
    unchangedPassedCaseIds,
    recommendation,
    promotionGate,
    textualGradient: buildTextualGradient({
      cases: input.selectedCases,
      candidateResults: input.candidateSummary.results,
      improvedCaseIds,
      regressedCaseIds,
      unchangedFailedCaseIds
    }),
    createdAt: nowIso()
  };
}

function buildPromotionGate(cases: AICheckCase[], candidateResults: AICheckEvalResult[]): AICheckPromptComparison["promotionGate"] {
  const resultByCaseId = new Map(candidateResults.map((result) => [result.evalCaseId, result]));
  const requiredDatasets: AICheckDatasetType[] = ["design", "regression", "holdout"];
  const datasetCoverage = requiredDatasets.map((datasetType) => {
    const datasetCases = cases.filter((testCase) => testCase.datasetType === datasetType);
    const passed = datasetCases.filter((testCase) => resultByCaseId.get(testCase.id)?.pass).length;
    return {
      datasetType,
      total: datasetCases.length,
      passed,
      passRate: datasetCases.length > 0 ? passed / datasetCases.length : 0
    };
  });
  const reasons: string[] = [];
  for (const row of datasetCoverage) {
    if (row.total === 0) {
      reasons.push(`${row.datasetType} coverage is missing.`);
    } else if (row.passed < row.total) {
      reasons.push(`${row.datasetType} coverage has ${row.total - row.passed} failing case(s).`);
    }
  }
  return {
    status: reasons.length === 0 ? "pass" : "fail",
    reasons: reasons.length === 0 ? ["Design, Regression, and Holdout coverage passed."] : reasons,
    datasetCoverage
  };
}

function buildTextualGradient(input: {
  cases: AICheckCase[];
  candidateResults: AICheckEvalResult[];
  improvedCaseIds: string[];
  regressedCaseIds: string[];
  unchangedFailedCaseIds: string[];
}): AICheckPromptComparison["textualGradient"] {
  const caseById = new Map(input.cases.map((testCase) => [testCase.id, testCase]));
  const resultByCaseId = new Map(input.candidateResults.map((result) => [result.evalCaseId, result]));
  const failedCaseIds = [...input.regressedCaseIds, ...input.unchangedFailedCaseIds];
  const clusterCounts = new Map<string, number>();

  for (const caseId of failedCaseIds) {
    const testCase = caseById.get(caseId);
    const result = resultByCaseId.get(caseId);
    const tags = testCase?.eval?.tags?.length ? testCase.eval.tags : ["untagged_failure"];
    for (const tag of tags.slice(0, 3)) {
      clusterCounts.set(tag, (clusterCounts.get(tag) ?? 0) + 1);
    }
    for (const reason of result?.failureReasons ?? []) {
      const label = reason.split(" expected ")[0] || reason;
      clusterCounts.set(label, (clusterCounts.get(label) ?? 0) + 1);
    }
  }

  const failureClusters = [...clusterCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([label, cases]) => ({
      label,
      cases,
      direction: buildClusterDirection(label)
    }));
  const suggestedPromptDirections = buildPromptDirections(failureClusters, input.regressedCaseIds.length);
  const riskNotes = [
    input.regressedCaseIds.length > 0
      ? `${input.regressedCaseIds.length} previously passing case(s) regressed; do not promote this candidate.`
      : "No previously passing cases regressed in this comparison.",
    "Treat Textual Gradient as diagnosis only. It must not overwrite the current Prompt Program.",
    "Use release review mode before making a promotion decision when Holdout cases are included."
  ];
  const summary =
    input.regressedCaseIds.length > 0
      ? `Candidate introduced ${input.regressedCaseIds.length} regression(s) and fixed ${input.improvedCaseIds.length} case(s).`
      : `Candidate fixed ${input.improvedCaseIds.length} case(s) with no observed regressions.`;

  return {
    summary,
    failureClusters,
    suggestedPromptDirections,
    riskNotes
  };
}

function buildClusterDirection(label: string): string {
  if (label.includes("over_allow") || label.includes("false allow") || label.includes("decision")) {
    return "Tighten the decision boundary for ALLOW and require specific purpose plus time boundary.";
  }
  if (label.includes("under_ask") || label.includes("ASK_MORE")) {
    return "Clarify when ASK_MORE is required before a terminal decision.";
  }
  if (label.includes("unsafe") || label.includes("nsfw")) {
    return "Strengthen sensitive-risk handling without adding explicit content.";
  }
  if (label.includes("wrong_cooldown") || label.includes("aiCooldownSeconds")) {
    return "Specify cooldown duration selection by strictness and risk level.";
  }
  if (label.includes("wrong_reason") || label.includes("decisionReasonCategory")) {
    return "Sharpen reason category definitions and examples.";
  }
  return "Add a targeted rubric or example for this failure pattern.";
}

function buildPromptDirections(
  failureClusters: AICheckPromptComparison["textualGradient"]["failureClusters"],
  regressionCount: number
): string[] {
  const directions = failureClusters.map((cluster) => cluster.direction);
  if (regressionCount > 0) {
    directions.unshift("Reduce the candidate patch before adding new behavior; regressions outrank improvements.");
  }
  return [...new Set(directions)].slice(0, 5);
}

function validateEvalRunArtifact(summary: AICheckEvalRunSummary): void {
  if (!summary?.run?.id) {
    throw new Error("Eval run artifact is missing run.id.");
  }
  if (!Array.isArray(summary.results)) {
    throw new Error("Eval run artifact results must be an array.");
  }
  if (!summary.run.createdAt || !summary.run.metrics || !Array.isArray(summary.run.caseIds)) {
    throw new Error("Eval run artifact is missing run metadata.");
  }
  if (!["tuning", "release_review"].includes(summary.run.mode)) {
    throw new Error("Eval run artifact has an invalid mode.");
  }
  if (!["mock", "byok"].includes(summary.run.providerMode)) {
    throw new Error("Eval run artifact has an invalid provider mode.");
  }
  for (const result of summary.results) {
    if (!result.id || result.runId !== summary.run.id || !result.evalCaseId || !result.createdAt) {
      throw new Error("Eval run artifact contains a malformed result.");
    }
  }
}

async function getEvalCaseById(id: string): Promise<AICheckCase | null> {
  const stored = await getRecord<AICheckCase>("evalCases", id);
  if (stored) return normalizeStoredEvalCase(stored);
  return BUILT_IN_AI_CHECK_CASES.find((item) => item.id === id) ?? null;
}

function mergeEvalCases(storedCases: AICheckCase[]): AICheckCase[] {
  const merged = new Map<string, AICheckCase>();
  for (const builtInCase of BUILT_IN_AI_CHECK_CASES) {
    merged.set(builtInCase.id, normalizeStoredEvalCase(builtInCase));
  }
  for (const storedCase of storedCases) {
    merged.set(storedCase.id, normalizeStoredEvalCase(storedCase));
  }
  return [...merged.values()];
}

function compareEvalCases(left: AICheckCase, right: AICheckCase): number {
  const leftUpdated = left.updatedAt ?? left.createdAt ?? "";
  const rightUpdated = right.updatedAt ?? right.createdAt ?? "";
  const updatedOrder = rightUpdated.localeCompare(leftUpdated);
  if (updatedOrder !== 0) return updatedOrder;
  return left.title.localeCompare(right.title);
}

function buildFallbackCaseInput(input: {
  targetDisplay: string;
  strictness: StrictnessLevel;
  messages: AICheckMessage[];
}): AICheckCaseInput {
  return {
    targetDisplay: input.targetDisplay,
    strictness: input.strictness,
    sessionContext: {
      assistantTurnCount: Math.max(0, input.messages.filter((message) => message.role === "assistant").length - 1),
      maxAssistantTurns: AI_CHECK_SESSION_POLICY.maxAssistantTurns,
      isFinalTurn: false
    },
    messages: input.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
        source: message.source
      })),
    patternMemorySnapshot: []
  };
}

function getStrictnessFromEvents(sessionId: string, events: BehaviorEvent[]): StrictnessLevel | null {
  const event = events
    .filter((item) => item.type === "ai_decision_applied")
    .find((item) => item.payload?.sessionId === sessionId && isStrictnessLevel(item.payload.strictness));
  return isStrictnessLevel(event?.payload?.strictness) ? event.payload.strictness : null;
}

function isStrictnessLevel(value: unknown): value is StrictnessLevel {
  return value === "gentle" || value === "balanced" || value === "strict" || value === "monk";
}

function buildEvalTitle(badCase: BadCaseReview): string {
  const expected = badCase.expectedDecision ? `expected ${badCase.expectedDecision}` : "expected decision";
  return `${badCase.targetDisplay} ${expected}`;
}

function normalizeStoredEvalCase(evalCase: AICheckCase): AICheckCase {
  const status = evalCase.archivedAt ? "archived" : evalCase.status ?? "ready";
  const legacyEval = (evalCase.eval ?? { expectedOutput: {}, tags: [] }) as NonNullable<AICheckCase["eval"]> & {
    allowedDecisions?: AIDecision[];
    disallowedDecisions?: AIDecision[];
    expectedCooldownRangeSeconds?: { min: number; max: number };
    expectedScoreRanges?: AICheckExpectedOutput["scores"];
    mustAskAbout?: string[];
    mustNotSay?: string[];
  };
  const expectedOutput: AICheckExpectedOutput = {
    ...(legacyEval?.expectedOutput ?? {}),
    ...(legacyEval?.mustAskAbout || legacyEval?.mustNotSay
      ? buildUserFacingExpectation(
          legacyEval.mustAskAbout,
          legacyEval.mustNotSay,
          legacyEval.expectedOutput?.userFacingMessage
        )
      : {}),
    ...(legacyEval?.expectedCooldownRangeSeconds ? { aiCooldownSeconds: legacyEval.expectedCooldownRangeSeconds } : {}),
    ...(legacyEval?.expectedScoreRanges ? { scores: legacyEval.expectedScoreRanges } : {})
  };
  if (legacyEval?.allowedDecisions?.length) {
    expectedOutput.decision = {
      allowed: legacyEval.allowedDecisions,
      ...(legacyEval.disallowedDecisions?.length ? { disallowed: legacyEval.disallowedDecisions } : {})
    };
  }
  const legacyBehaviorReason = (expectedOutput as AICheckExpectedOutput & {
    behaviorReasonCategory?: BehaviorReasonCategory;
  }).behaviorReasonCategory;
  if (legacyBehaviorReason) {
    expectedOutput.memoryUpdate = {
      ...(expectedOutput.memoryUpdate ?? {}),
      behaviorReasonCategory: legacyBehaviorReason
    };
    delete (expectedOutput as AICheckExpectedOutput & { behaviorReasonCategory?: BehaviorReasonCategory }).behaviorReasonCategory;
  }
  const normalized: AICheckCase = {
    ...evalCase,
    eval: {
      expectedOutput,
      tags: legacyEval?.tags ?? [],
      reviewerNote: legacyEval?.reviewerNote
    },
    status,
    createdAt: evalCase.createdAt ?? evalCase.updatedAt ?? nowIso(),
    updatedAt: evalCase.updatedAt ?? evalCase.createdAt ?? nowIso()
  };
  if (status !== "archived" && normalized.archivedAt) {
    delete normalized.archivedAt;
  }
  return normalized;
}

function cleanList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function buildUserFacingExpectation(
  mustMention: string[] | undefined,
  mustNotMention: string[] | undefined,
  current?: AICheckExpectedOutput["userFacingMessage"]
): { userFacingMessage?: NonNullable<AICheckExpectedOutput["userFacingMessage"]> } {
  if (mustMention === undefined && mustNotMention === undefined) {
    return current ? { userFacingMessage: current } : {};
  }
  const next: NonNullable<AICheckExpectedOutput["userFacingMessage"]> = {
    ...(current ?? {}),
    mustMention: cleanList(mustMention),
    mustNotMention: cleanList(mustNotMention)
  };
  if (!next.mustMention?.length) {
    delete next.mustMention;
  }
  if (!next.mustNotMention?.length) {
    delete next.mustNotMention;
  }
  return Object.keys(next).length ? { userFacingMessage: next } : {};
}
