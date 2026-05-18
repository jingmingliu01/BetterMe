import { ACCESS_TIMING, BASIC_COOLDOWN_POLICIES } from "../shared/constants";
import { createId } from "../shared/id";
import type { BasicCooldown, StrictnessLevel, TemporaryUnlock } from "../shared/types";
import { createTemporaryUnlock } from "./unlocks";

export function createBasicCooldown(input: {
  targetId: string;
  targetDisplay: string;
  attemptUrl?: string | null;
  now?: Date;
  seconds?: number;
  unlockSeconds?: number;
  claimWindowSeconds?: number;
  strictness?: StrictnessLevel;
  attemptCount?: number;
}): BasicCooldown {
  const now = input.now ?? new Date();
  const seconds = input.seconds ?? ACCESS_TIMING.basicCooldownSeconds;
  const unlockSeconds = input.unlockSeconds ?? ACCESS_TIMING.basicCooldownUnlockSeconds;
  const claimWindowSeconds = input.claimWindowSeconds ?? ACCESS_TIMING.completedCooldownClaimSeconds;
  const endsAt = new Date(now.getTime() + seconds * 1000);
  return {
    id: createId("cooldown"),
    targetId: input.targetId,
    targetDisplay: input.targetDisplay,
    attemptUrl: input.attemptUrl ?? null,
    createdAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    claimExpiresAt: new Date(endsAt.getTime() + claimWindowSeconds * 1000).toISOString(),
    unlockMinutes: unlockSeconds / 60,
    strictness: input.strictness,
    attemptCount: input.attemptCount
  };
}

export function isCooldownActive(cooldown: BasicCooldown, now = new Date()): boolean {
  return !cooldown.completedAt && new Date(cooldown.endsAt).getTime() > now.getTime();
}

export function isCooldownComplete(cooldown: BasicCooldown, now = new Date()): boolean {
  const nowMs = now.getTime();
  return (
    !cooldown.completedAt &&
    new Date(cooldown.endsAt).getTime() <= nowMs &&
    getCooldownClaimExpiresAt(cooldown).getTime() > nowMs
  );
}

export function isCooldownClaimExpired(cooldown: BasicCooldown, now = new Date()): boolean {
  return !cooldown.completedAt && getCooldownClaimExpiresAt(cooldown).getTime() <= now.getTime();
}

export function getCooldownClaimExpiresAt(cooldown: BasicCooldown): Date {
  if (cooldown.claimExpiresAt) {
    return new Date(cooldown.claimExpiresAt);
  }
  const policy = cooldown.strictness ? BASIC_COOLDOWN_POLICIES[cooldown.strictness] : null;
  const claimWindowSeconds = policy?.claimWindowSeconds ?? ACCESS_TIMING.completedCooldownClaimSeconds;
  return new Date(new Date(cooldown.endsAt).getTime() + claimWindowSeconds * 1000);
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
