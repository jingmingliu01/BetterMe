import { getBlockedTargets, getUnlocks } from "../storage/domain-store";
import type { BlockedTarget } from "../shared/types";

const RULE_ID_BASE = 10_000;

function hasDnr(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.declarativeNetRequest);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeRule(id: number, target: BlockedTarget): chrome.declarativeNetRequest.Rule {
  const extensionPath = `/block.html?targetId=${encodeURIComponent(target.id)}`;

  if (target.type === "domain") {
    return {
      id,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: { extensionPath }
      },
      condition: {
        regexFilter: `^https?://([^/]+\\.)?${escapeRegex(target.value)}(/|$)`,
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
      }
    };
  }

  return {
    id,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: { extensionPath }
    },
    condition: {
      urlFilter: target.value,
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
    }
  };
}

export async function rebuildDnrRules(): Promise<void> {
  if (!hasDnr()) {
    return;
  }

  const [targets, unlocks, currentRules] = await Promise.all([
    getBlockedTargets(),
    getUnlocks(),
    chrome.declarativeNetRequest.getDynamicRules()
  ]);
  const unlockedTargetIds = new Set(unlocks.map((unlock) => unlock.targetId));
  const activeTargets = targets.filter((target) => target.enabled && !unlockedTargetIds.has(target.id));
  const removeRuleIds = currentRules
    .filter((rule) => rule.id >= RULE_ID_BASE)
    .map((rule) => rule.id);
  const addRules = activeTargets.map((target, index) => makeRule(RULE_ID_BASE + index, target));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}
