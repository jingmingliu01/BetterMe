import { AI_CHECK_CURRENT_VERSIONS, AI_CHECK_SESSION_POLICY } from "../shared/ai-check-contract";
import { PROVIDERS } from "../shared/constants";
import { createId, nowIso } from "../shared/id";
import { loadDecryptedApiKey } from "../storage/crypto-key-store";
import { BUILT_IN_AI_CHECK_CASES } from "./built-in-eval-cases";
import { deriveDecisionPointSnapshotFromHistory } from "./decision-point-snapshot";
import { runEvalExperimentForCases } from "./eval-engine";
import type {
  AICheckCase,
  AICheckCaseInput,
  AICheckDecisionPointSnapshot,
  AICheckExpectedOutput,
  AICheckEvalResult,
  AICheckEvalRun,
  AICheckEvalRunSummary,
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
  CreateReleaseDecisionInput,
  CreateEvalCaseInput,
  RunEvalExperimentInput,
  StrictnessLevel,
  UpdateEvalCaseInput
} from "../shared/types";
import { getAllRecords, getRecord, putRecord } from "../storage/indexed-db";

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
