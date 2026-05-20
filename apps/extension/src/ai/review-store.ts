import { listPatternMemory } from "./pattern-memory";
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
  StrictnessLevel
} from "../shared/types";
import { getAllRecords, getRecord, putRecord } from "../storage/indexed-db";

export const AI_CHECK_PROMPT_VERSION = "ai-check-prompt-v1";
export const AI_CHECK_SCHEMA_VERSION = "checkpoint-decision-v1";
export const AI_CHECK_RUBRIC_VERSION = "strictness-rubric-v1";

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
        maxAssistantTurns: 3,
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
        behaviorReasonCategory: memory.reasonCategory,
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
  return cases.sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
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
