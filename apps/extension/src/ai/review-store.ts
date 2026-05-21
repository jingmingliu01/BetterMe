import { listPatternMemory } from "./pattern-memory";
import { AI_CHECK_CONTRACT, AI_CHECK_SESSION_POLICY } from "../shared/ai-check-contract";
import { createId, nowIso } from "../shared/id";
import type {
  AICheckCase,
  AICheckEvalResult,
  AICheckEvalRun,
  AICheckMessage,
  AICheckSession,
  AIDecision,
  AIPMReviewSession,
  BadCaseErrorType,
  BadCaseReview,
  BehaviorEvent,
  CheckpointDecision,
  CreateEvalCaseInput,
  StrictnessLevel,
  UpdateEvalCaseInput
} from "../shared/types";
import { getAllRecords, getRecord, putRecord } from "../storage/indexed-db";

export const AI_CHECK_PROMPT_VERSION = AI_CHECK_CONTRACT.promptVersion;
export const AI_CHECK_SCHEMA_VERSION = AI_CHECK_CONTRACT.schemaVersion;
export const AI_CHECK_RUBRIC_VERSION = AI_CHECK_CONTRACT.rubricVersion;

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
      const badCase =
        badCases
          .filter((item) => item.sourceSessionId === session.id)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
      return {
        session: {
          ...session,
          strictness: session.strictness ?? getStrictnessFromEvents(session.id, behaviorEvents) ?? undefined
        },
        messages: sessionMessages,
        decisions: sessionDecisions,
        badCase
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
  const [messages, decisions, behaviorEvents] = await Promise.all([
    getAllRecords<AICheckMessage>("aiCheckMessages"),
    getAllRecords<CheckpointDecision>("checkpointDecisions"),
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
  const now = nowIso();
  const review: BadCaseReview = {
    id: createId("badcase"),
    sourceSessionId: session.id,
    sourceDecisionId: decision?.id ?? null,
    targetDisplay: session.targetDisplay,
    strictness: session.strictness ?? getStrictnessFromEvents(session.id, behaviorEvents),
    messages: sessionMessages,
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
    source: "bad_case_review",
    versions: {
      promptVersion: AI_CHECK_PROMPT_VERSION,
      schemaVersion: AI_CHECK_SCHEMA_VERSION,
      rubricVersion: AI_CHECK_RUBRIC_VERSION
    },
    input: {
      targetDisplay: badCase.targetDisplay,
      strictness,
      sessionContext: {
        assistantTurnCount: Math.max(0, badCase.messages.filter((message) => message.role === "assistant").length - 1),
        maxAssistantTurns: AI_CHECK_SESSION_POLICY.maxAssistantTurns,
        isFinalTurn: false
      },
      messages: badCase.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role,
          content: message.content,
          source: message.source
        })),
      patternMemorySnapshot: (await listPatternMemory(badCase.targetDisplay)).map((memory) => ({
        targetDisplay: memory.targetDisplay,
        behaviorReasonCategory: memory.behaviorReasonCategory,
        repeatedCount: memory.repeatedCount,
        lastUserReason: memory.lastUserReason,
        guidance: memory.guidance,
        updatedAt: memory.updatedAt
      }))
    },
    eval: {
      expectedOutput: {
        decision: badCase.expectedDecision
      },
      disallowedDecisions: badCase.actualDecision ? [badCase.actualDecision].filter((item) => item !== badCase.expectedDecision) : [],
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
  return normalized.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
}

export async function createEvalCase(input: CreateEvalCaseInput): Promise<AICheckCase> {
  const now = nowIso();
  const evalCase = normalizeStoredEvalCase({
    id: createId("eval"),
    title: input.title.trim() || "Untitled evaluation case",
    source: input.source ?? "authored_eval",
    versions: {
      promptVersion: AI_CHECK_PROMPT_VERSION,
      schemaVersion: AI_CHECK_SCHEMA_VERSION,
      rubricVersion: AI_CHECK_RUBRIC_VERSION
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
        decision: input.expectedDecision
      },
      tags: cleanList(input.tags),
      reviewerNote: input.reviewerNote?.trim() || undefined,
      mustAskAbout: cleanList(input.mustAskAbout),
      mustNotSay: cleanList(input.mustNotSay)
    },
    status: input.status ?? "draft",
    createdAt: now,
    updatedAt: now
  });
  await putRecord("evalCases", evalCase);
  return evalCase;
}

export async function updateEvalCase(input: UpdateEvalCaseInput): Promise<AICheckCase> {
  const existing = await getRecord<AICheckCase>("evalCases", input.id);
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
        decision: input.expectedDecision ?? current.eval?.expectedOutput.decision ?? "ASK_MORE"
      },
      allowedDecisions: current.eval?.allowedDecisions,
      disallowedDecisions: current.eval?.disallowedDecisions,
      expectedCooldownRangeSeconds: current.eval?.expectedCooldownRangeSeconds,
      expectedScoreRanges: current.eval?.expectedScoreRanges,
      tags: input.tags !== undefined ? cleanList(input.tags) : current.eval?.tags ?? [],
      reviewerNote:
        input.reviewerNote !== undefined ? input.reviewerNote.trim() || undefined : current.eval?.reviewerNote,
      mustAskAbout: input.mustAskAbout !== undefined ? cleanList(input.mustAskAbout) : current.eval?.mustAskAbout,
      mustNotSay: input.mustNotSay !== undefined ? cleanList(input.mustNotSay) : current.eval?.mustNotSay
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
  const existing = await getRecord<AICheckCase>("evalCases", input.id);
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
  const normalized: AICheckCase = {
    ...evalCase,
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
