import type {
  AccessState,
  BasicCooldown,
  BlockHold,
  BlockedTarget,
  TemporaryUnlock
} from "../shared/types";
import { isCooldownActive } from "./cooldowns";
import { isBlockHoldActive, isUnlockActive } from "./unlocks";

export function getActiveUnlockForTarget(
  targetId: string,
  unlocks: TemporaryUnlock[],
  now = new Date()
): TemporaryUnlock | null {
  return unlocks.find((unlock) => unlock.targetId === targetId && isUnlockActive(unlock, now)) ?? null;
}

export function getActiveCooldownForTarget(
  targetId: string,
  cooldowns: BasicCooldown[],
  now = new Date()
): BasicCooldown | null {
  return cooldowns.find((cooldown) => cooldown.targetId === targetId && isCooldownActive(cooldown, now)) ?? null;
}

export function getActiveHoldForTarget(targetId: string, holds: BlockHold[], now = new Date()): BlockHold | null {
  return holds.find((hold) => hold.targetId === targetId && isBlockHoldActive(hold, now)) ?? null;
}

export function deriveAccessState(input: {
  target: BlockedTarget | null;
  unlocks: TemporaryUnlock[];
  cooldowns: BasicCooldown[];
  holds: BlockHold[];
  now?: Date;
}): AccessState {
  if (!input.target || !input.target.enabled) {
    return "not_blocked";
  }

  const now = input.now ?? new Date();
  if (getActiveHoldForTarget(input.target.id, input.holds, now)) {
    return "block_held_until_tomorrow";
  }
  if (getActiveUnlockForTarget(input.target.id, input.unlocks, now)) {
    return "temporarily_unlocked";
  }
  if (getActiveCooldownForTarget(input.target.id, input.cooldowns, now)) {
    return "cooling_down";
  }
  return "blocked";
}
