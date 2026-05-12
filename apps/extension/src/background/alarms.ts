import { ACCESS_TIMING } from "../shared/constants";
import { findMatchingTarget } from "../blocking/match-rules";
import { getBlockedTargets, getCooldowns, getHolds, getStoredUnlocks, getUnlocks } from "../storage/domain-store";
import type { TemporaryUnlock } from "../shared/types";
import { rebuildDnrRules } from "./dnr-rules";

const ACCESS_STATE_ALARM = "betterme.access-state";

function hasAlarms(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.alarms);
}

export async function scheduleAccessStateAlarm(when: Date): Promise<void> {
  if (!hasAlarms()) {
    return;
  }
  await chrome.alarms.create(ACCESS_STATE_ALARM, { when: when.getTime() });
}

export async function scheduleNextAccessStateAlarm(): Promise<void> {
  if (!hasAlarms()) {
    return;
  }

  const [unlocks, holds, cooldowns] = await Promise.all([getUnlocks(), getHolds(), getCooldowns()]);
  const timestamps = [
    ...unlocks.map((unlock) => new Date(unlock.expiresAt).getTime()),
    ...holds.map((hold) => new Date(hold.expiresAt).getTime()),
    ...cooldowns.filter((cooldown) => !cooldown.completedAt).map((cooldown) => new Date(cooldown.endsAt).getTime())
  ].filter((timestamp) => Number.isFinite(timestamp) && timestamp > Date.now());

  await chrome.alarms.clear(ACCESS_STATE_ALARM);
  if (timestamps.length === 0) {
    return;
  }
  await scheduleAccessStateAlarm(new Date(Math.min(...timestamps) + 250));
}

export async function handleAccessStateAlarm(alarmName: string): Promise<void> {
  if (alarmName !== ACCESS_STATE_ALARM) {
    return;
  }
  const storedUnlocks = await getStoredUnlocks();
  const expiredUnlocks = getExpiredUnlocks(storedUnlocks);
  await rebuildDnrRules();
  await redirectExpiredUnlockTabs(expiredUnlocks);
  await scheduleNextAccessStateAlarm();
}

function getExpiredUnlocks(unlocks: TemporaryUnlock[], now = Date.now()): TemporaryUnlock[] {
  return unlocks.filter((unlock) => new Date(unlock.expiresAt).getTime() <= now);
}

async function redirectExpiredUnlockTabs(expiredUnlocks: TemporaryUnlock[]): Promise<void> {
  if (!chrome.tabs || expiredUnlocks.length === 0) {
    return;
  }

  const targets = await getBlockedTargets();
  const expiredTargetIds = new Set(expiredUnlocks.map((unlock) => unlock.targetId));
  const expiredTargets = targets.filter((target) => expiredTargetIds.has(target.id));
  if (expiredTargets.length === 0) {
    return;
  }

  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url) {
        return;
      }
      const matched = findMatchingTarget(tab.url, expiredTargets);
      if (!matched) {
        return;
      }
      const blockUrl = chrome.runtime.getURL(`block.html?targetId=${encodeURIComponent(matched.id)}`);
      await chrome.tabs.update(tab.id, { url: blockUrl });
    })
  );
}
