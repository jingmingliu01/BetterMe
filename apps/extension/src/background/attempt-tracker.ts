import { findMatchingTarget } from "../blocking/match-rules";
import { createId, nowIso } from "../shared/id";
import { getBlockedTargets, saveTargetAttempt } from "../storage/domain-store";

function hasWebNavigation(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.webNavigation);
}

export function registerAttemptTracker(): void {
  if (!hasWebNavigation()) {
    return;
  }

  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) {
      return;
    }
    void captureAttempt(details.url, details.tabId);
  });
}

async function captureAttempt(url: string, tabId?: number): Promise<void> {
  if (url.startsWith("chrome-extension://")) {
    return;
  }

  const targets = await getBlockedTargets();
  const target = findMatchingTarget(url, targets);
  if (!target) {
    return;
  }

  await saveTargetAttempt({
    id: createId("attempt"),
    targetId: target.id,
    tabId,
    attemptUrl: url,
    createdAt: nowIso()
  });
}
