import { createId, nowIso } from "../shared/id";
import type { CheckpointDecision, PatternMemory } from "../shared/types";
import { getAllRecords, putRecord } from "../storage/indexed-db";

export async function listPatternMemory(targetDisplay?: string): Promise<PatternMemory[]> {
  const memories = await getAllRecords<PatternMemory>("patternMemories");
  return targetDisplay ? memories.filter((memory) => memory.targetDisplay === targetDisplay) : memories;
}

export async function updatePatternMemory(input: {
  targetDisplay: string;
  userReason: string;
  decision: CheckpointDecision;
}): Promise<PatternMemory> {
  const memories = await listPatternMemory(input.targetDisplay);
  const existing = memories.find(
    (memory) => memory.behaviorReasonCategory === input.decision.memoryUpdate.behaviorReasonCategory
  );

  const next: PatternMemory = {
    id: existing?.id ?? createId("memory"),
    targetDisplay: input.targetDisplay,
    behaviorReasonCategory: input.decision.memoryUpdate.behaviorReasonCategory,
    repeatedCount: (existing?.repeatedCount ?? 0) + 1,
    lastUserReason: input.userReason,
    guidance:
      input.decision.memoryUpdate.patternNote ??
      existing?.guidance ??
      "Challenge the user to make the plan specific and bounded.",
    updatedAt: nowIso()
  };

  await putRecord("patternMemories", next);
  return next;
}
