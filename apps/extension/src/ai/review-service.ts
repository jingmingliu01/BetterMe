import { createId, nowIso } from "../shared/id";
import type { BadCaseReview, EvalCase } from "../shared/types";
import { getTrackBundle } from "./track-service";
import { getAllRecords, getRecord, putRecord } from "../storage/indexed-db";

export async function createBadCaseReview(
  input: Omit<BadCaseReview, "id" | "createdAt">
): Promise<BadCaseReview> {
  const review: BadCaseReview = {
    ...input,
    id: createId("badcase"),
    createdAt: nowIso()
  };
  await putRecord("badCaseReviews", review);
  return review;
}

export async function listBadCaseReviews(): Promise<BadCaseReview[]> {
  const reviews = await getAllRecords<BadCaseReview>("badCaseReviews");
  return reviews.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createEvalCaseFromBadCase(badCaseId: string): Promise<EvalCase> {
  const review = await getRecord<BadCaseReview>("badCaseReviews", badCaseId);
  if (!review) {
    throw new Error("Bad case not found.");
  }

  const bundle = await getTrackBundle(review.trackId);
  const promptInput = bundle.messages
    .filter((message) => message.role !== "system")
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");

  const evalCase: EvalCase = {
    id: createId("eval"),
    sourceBadCaseId: review.id,
    title: `${review.types[0] ?? "bad_case"} on ${review.targetDisplay}`,
    targetDisplay: review.targetDisplay,
    promptInput,
    expectedDecision: review.expectedDecision,
    assertions: [
      review.proposedEvalAssertion,
      `Decision must be ${review.expectedDecision}.`,
      "Response must be valid structured JSON."
    ],
    tags: review.types,
    createdAt: nowIso()
  };
  await putRecord("evalCases", evalCase);
  return evalCase;
}

export async function listEvalCases(): Promise<EvalCase[]> {
  const evalCases = await getAllRecords<EvalCase>("evalCases");
  return evalCases.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
