import { getTargetKey } from "../blocking/target-parser";
import { createId, nowIso } from "../shared/id";
import type { BehaviorEvent, BehaviorEventType, BlockedTarget } from "../shared/types";
import { getAllRecords, putRecord } from "./indexed-db";

export async function appendBehaviorEvent(input: {
  type: BehaviorEventType;
  target?: BlockedTarget | null;
  targetId?: string;
  targetKey?: string;
  targetDisplay?: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
}): Promise<BehaviorEvent> {
  const event: BehaviorEvent = {
    id: createId("event"),
    type: input.type,
    targetKey: input.target ? getTargetKey(input.target) : input.targetKey,
    targetId: input.target?.id ?? input.targetId,
    targetDisplay: input.target?.display ?? input.targetDisplay,
    createdAt: input.createdAt ?? nowIso(),
    payload: input.payload
  };

  await putRecord("behaviorEvents", event);
  return event;
}

export async function listBehaviorEvents(limit = 200): Promise<BehaviorEvent[]> {
  const events = await getAllRecords<BehaviorEvent>("behaviorEvents");
  return events.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit);
}

export async function listBehaviorEventsForTargetKey(targetKey: string): Promise<BehaviorEvent[]> {
  const events = await getAllRecords<BehaviorEvent>("behaviorEvents");
  return events
    .filter((event) => event.targetKey === targetKey)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function wasTargetPreviouslyRemoved(targetKey: string): Promise<boolean> {
  const events = await listBehaviorEventsForTargetKey(targetKey);
  const lastLifecycleEvent = events.find((event) =>
    ["blocked_target_added", "blocked_target_readded", "blocked_target_removed"].includes(event.type)
  );
  return lastLifecycleEvent?.type === "blocked_target_removed";
}

export function buildAttemptPayload(url: string): Record<string, unknown> {
  try {
    const parsed = new URL(url);
    return {
      origin: parsed.origin,
      path: parsed.pathname,
      hasSearch: parsed.search.length > 0,
      hasHash: parsed.hash.length > 0
    };
  } catch {
    return {
      invalidUrl: true
    };
  }
}
