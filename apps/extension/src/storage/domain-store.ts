import { DEFAULT_SETTINGS, PROVIDERS, STORAGE_KEYS } from "../shared/constants";
import type { BasicCooldown, BlockHold, BlockedTarget, TargetAttempt, TemporaryUnlock, UserSettings } from "../shared/types";
import { isCooldownActive, isCooldownComplete } from "../blocking/cooldowns";
import { isBlockHoldActive, isUnlockActive } from "../blocking/unlocks";
import { getLocalValue, setLocalValue } from "./local-store";

export async function getSettings(): Promise<UserSettings> {
  const settings = await getLocalValue<UserSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...settings, license: { ...DEFAULT_SETTINGS.license, ...settings.license } };
  const provider = PROVIDERS.find((item) => item.id === merged.provider) ?? PROVIDERS[0];
  return {
    ...merged,
    provider: provider.id,
    model: provider.models.includes(merged.model) ? merged.model : provider.defaultModel
  };
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await setLocalValue(STORAGE_KEYS.settings, settings);
}

export async function updateSettings(patch: Partial<Omit<UserSettings, "license">>): Promise<UserSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export async function getBlockedTargets(): Promise<BlockedTarget[]> {
  return getLocalValue<BlockedTarget[]>(STORAGE_KEYS.blockedTargets, []);
}

export async function saveBlockedTargets(targets: BlockedTarget[]): Promise<void> {
  await setLocalValue(STORAGE_KEYS.blockedTargets, targets);
}

export async function addBlockedTarget(target: BlockedTarget): Promise<BlockedTarget[]> {
  const targets = await getBlockedTargets();
  const next = [target, ...targets.filter((item) => item.value !== target.value || item.type !== target.type)];
  await saveBlockedTargets(next);
  return next;
}

export async function deleteBlockedTarget(id: string): Promise<BlockedTarget[]> {
  const targets = await getBlockedTargets();
  const next = targets.filter((target) => target.id !== id);
  await saveBlockedTargets(next);
  return next;
}

export async function deleteAccessStateForTarget(targetId: string): Promise<void> {
  const [unlocks, cooldowns, holds] = await Promise.all([getStoredUnlocks(), getCooldowns(), getHolds()]);
  await Promise.all([
    saveUnlocks(unlocks.filter((unlock) => unlock.targetId !== targetId)),
    saveCooldowns(cooldowns.filter((cooldown) => cooldown.targetId !== targetId)),
    saveHolds(holds.filter((hold) => hold.targetId !== targetId))
  ]);
}

export async function getUnlocks(): Promise<TemporaryUnlock[]> {
  const unlocks = await getLocalValue<TemporaryUnlock[]>(STORAGE_KEYS.unlocks, []);
  return unlocks.filter((unlock) => isUnlockActive(unlock));
}

export async function getStoredUnlocks(): Promise<TemporaryUnlock[]> {
  return getLocalValue<TemporaryUnlock[]>(STORAGE_KEYS.unlocks, []);
}

export async function saveUnlocks(unlocks: TemporaryUnlock[]): Promise<void> {
  await setLocalValue(STORAGE_KEYS.unlocks, unlocks.filter((unlock) => isUnlockActive(unlock)));
}

export async function addUnlock(unlock: TemporaryUnlock): Promise<TemporaryUnlock[]> {
  const unlocks = await getUnlocks();
  const next = [unlock, ...unlocks.filter((item) => item.targetId !== unlock.targetId)];
  await saveUnlocks(next);
  return next;
}

export async function getCooldowns(): Promise<BasicCooldown[]> {
  const cooldowns = await getLocalValue<BasicCooldown[]>(STORAGE_KEYS.cooldowns, []);
  return cooldowns.filter((cooldown) => isCooldownActive(cooldown) || isCooldownComplete(cooldown));
}

export async function saveCooldowns(cooldowns: BasicCooldown[]): Promise<void> {
  await setLocalValue(
    STORAGE_KEYS.cooldowns,
    cooldowns.filter((cooldown) => isCooldownActive(cooldown) || isCooldownComplete(cooldown))
  );
}

export async function addCooldown(cooldown: BasicCooldown): Promise<BasicCooldown[]> {
  const cooldowns = await getCooldowns();
  const next = [cooldown, ...cooldowns.filter((item) => item.targetId !== cooldown.targetId)];
  await saveCooldowns(next);
  return next;
}

export async function completeCooldown(id: string, completedAt: string): Promise<BasicCooldown> {
  const cooldowns = await getCooldowns();
  const cooldown = cooldowns.find((item) => item.id === id);
  if (!cooldown) {
    throw new Error("Cooldown not found.");
  }
  const completed = { ...cooldown, completedAt };
  await saveCooldowns(cooldowns.map((item) => (item.id === id ? completed : item)));
  return completed;
}

export async function getHolds(): Promise<BlockHold[]> {
  const holds = await getLocalValue<BlockHold[]>(STORAGE_KEYS.holds, []);
  return holds.filter((hold) => isBlockHoldActive(hold));
}

export async function saveHolds(holds: BlockHold[]): Promise<void> {
  await setLocalValue(STORAGE_KEYS.holds, holds.filter((hold) => isBlockHoldActive(hold)));
}

export async function addHold(hold: BlockHold): Promise<BlockHold[]> {
  const holds = await getHolds();
  const next = [hold, ...holds.filter((item) => item.targetId !== hold.targetId)];
  await saveHolds(next);
  return next;
}

export async function getTargetAttempts(): Promise<TargetAttempt[]> {
  return getLocalValue<TargetAttempt[]>(STORAGE_KEYS.targetAttempts, []);
}

export async function saveTargetAttempt(attempt: TargetAttempt): Promise<TargetAttempt[]> {
  const attempts = await getTargetAttempts();
  const next = [
    attempt,
    ...attempts
      .filter((item) => item.targetId !== attempt.targetId || item.tabId !== attempt.tabId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 30)
  ];
  await setLocalValue(STORAGE_KEYS.targetAttempts, next);
  return next;
}

export async function getLatestTargetAttempt(targetId: string): Promise<TargetAttempt | null> {
  const attempts = await getTargetAttempts();
  return attempts.find((attempt) => attempt.targetId === targetId) ?? null;
}
