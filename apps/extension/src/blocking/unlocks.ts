import { BASIC_COOLDOWN_SECONDS } from "../shared/constants";
import { createId } from "../shared/id";
import type { BlockHold, TemporaryUnlock } from "../shared/types";

export function createTemporaryUnlock(input: {
  targetId: string;
  targetDisplay: string;
  minutes?: number;
  source: TemporaryUnlock["source"];
  now?: Date;
}): TemporaryUnlock {
  const now = input.now ?? new Date();
  const minutes = input.minutes ?? BASIC_COOLDOWN_SECONDS / 60;
  return {
    id: createId("unlock"),
    targetId: input.targetId,
    targetDisplay: input.targetDisplay,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + minutes * 60_000).toISOString(),
    source: input.source
  };
}

export function isUnlockActive(unlock: TemporaryUnlock, now = new Date()): boolean {
  return new Date(unlock.expiresAt).getTime() > now.getTime();
}

export function getNextLocalMidnight(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
}

export function createBlockHoldUntilNextDay(input: {
  targetId: string;
  targetDisplay: string;
  sourceSessionId: string;
  now?: Date;
}): BlockHold {
  const now = input.now ?? new Date();
  return {
    id: createId("hold"),
    targetId: input.targetId,
    targetDisplay: input.targetDisplay,
    createdAt: now.toISOString(),
    expiresAt: getNextLocalMidnight(now).toISOString(),
    sourceSessionId: input.sourceSessionId
  };
}

export function isBlockHoldActive(hold: BlockHold, now = new Date()): boolean {
  return new Date(hold.expiresAt).getTime() > now.getTime();
}
