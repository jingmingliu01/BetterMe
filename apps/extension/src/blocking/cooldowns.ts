import { ACCESS_TIMING } from "../shared/constants";
import { createId } from "../shared/id";
import type { BasicCooldown, TemporaryUnlock } from "../shared/types";
import { createTemporaryUnlock } from "./unlocks";

export function createBasicCooldown(input: {
  targetId: string;
  targetDisplay: string;
  attemptUrl?: string | null;
  now?: Date;
  seconds?: number;
  unlockSeconds?: number;
}): BasicCooldown {
  const now = input.now ?? new Date();
  const seconds = input.seconds ?? ACCESS_TIMING.basicCooldownSeconds;
  const unlockSeconds = input.unlockSeconds ?? ACCESS_TIMING.basicCooldownUnlockSeconds;
  return {
    id: createId("cooldown"),
    targetId: input.targetId,
    targetDisplay: input.targetDisplay,
    attemptUrl: input.attemptUrl ?? null,
    createdAt: now.toISOString(),
    endsAt: new Date(now.getTime() + seconds * 1000).toISOString(),
    unlockMinutes: unlockSeconds / 60
  };
}

export function isCooldownActive(cooldown: BasicCooldown, now = new Date()): boolean {
  return !cooldown.completedAt && new Date(cooldown.endsAt).getTime() > now.getTime();
}

export function isCooldownComplete(cooldown: BasicCooldown, now = new Date()): boolean {
  return !cooldown.completedAt && new Date(cooldown.endsAt).getTime() <= now.getTime();
}

export function createUnlockFromCompletedCooldown(
  cooldown: BasicCooldown,
  now = new Date()
): TemporaryUnlock {
  if (!isCooldownComplete(cooldown, now)) {
    throw new Error("Cooldown is not complete yet.");
  }
  return createTemporaryUnlock({
    targetId: cooldown.targetId,
    targetDisplay: cooldown.targetDisplay,
    minutes: cooldown.unlockMinutes,
    source: "basic_cooldown",
    now
  });
}
