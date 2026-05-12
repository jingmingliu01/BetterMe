import type { ExtensionResult, PageAccessInfo } from "../shared/types";

let redirectTimer: number | undefined;
let warningTimer: number | undefined;
let warningHost: HTMLElement | undefined;
let warnedUnlockId: string | null = null;

void installExpiryGuard();
registerStorageRefresh();

async function installExpiryGuard(): Promise<void> {
  if (!isSupportedPage()) {
    return;
  }

  try {
    const result = (await chrome.runtime.sendMessage({
      type: "blocking/getPageAccess",
      payload: { url: window.location.href }
    })) as ExtensionResult<PageAccessInfo>;

    if (!result.ok || !result.data?.targetId) {
      clearTimers();
      removeWarningOverlay();
      return;
    }

    const blockUrl = chrome.runtime.getURL(`block.html?targetId=${encodeURIComponent(result.data.targetId)}`);
    if (result.data.shouldRedirectNow) {
      window.location.replace(blockUrl);
      return;
    }

    if (result.data.unlockExpiresAt) {
      scheduleWarningAt(result.data);
      scheduleRedirectAt(result.data.unlockExpiresAt, blockUrl);
    }
  } catch {
    // Content scripts should not break the visited page if the service worker is unavailable.
  }
}

function scheduleRedirectAt(expiresAt: string, blockUrl: string): void {
  if (redirectTimer) {
    window.clearTimeout(redirectTimer);
  }

  const delayMs = Math.max(0, new Date(expiresAt).getTime() - Date.now() + 250);
  redirectTimer = window.setTimeout(() => {
    window.location.replace(blockUrl);
  }, delayMs);
}

function scheduleWarningAt(accessInfo: PageAccessInfo): void {
  if (warningTimer) {
    window.clearTimeout(warningTimer);
  }
  if (!accessInfo.unlockExpiresAt || !accessInfo.unlockId) {
    return;
  }

  const expiresAtMs = new Date(accessInfo.unlockExpiresAt).getTime();
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) {
    return;
  }

  const warningDelayMs = Math.max(0, remainingMs - accessInfo.unlockWarningRemainingSeconds * 1000);
  warningTimer = window.setTimeout(() => {
    showWarningOverlay(accessInfo);
  }, warningDelayMs);
}

function showWarningOverlay(accessInfo: PageAccessInfo): void {
  if (!accessInfo.unlockId || warnedUnlockId === accessInfo.unlockId || warningHost) {
    return;
  }

  warnedUnlockId = accessInfo.unlockId;
  warningHost = document.createElement("betterme-unlock-warning");
  warningHost.style.all = "initial";
  const shadow = warningHost.attachShadow({ mode: "open" });
  const target = accessInfo.targetDisplay ?? "this site";

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(13, 24, 18, 0.28);
        backdrop-filter: blur(8px);
      }
      .dialog {
        width: min(560px, calc(100vw - 48px));
        border: 1px solid rgba(31, 107, 77, 0.2);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 24px 80px rgba(13, 24, 18, 0.28);
        color: #18201b;
        overflow: hidden;
      }
      .body {
        display: grid;
        gap: 14px;
        padding: 24px;
        text-align: center;
      }
      .kicker {
        color: #1f6b4d;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0;
      }
      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.15;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: #526257;
        font-size: 15px;
        line-height: 1.45;
      }
      button {
        min-height: 44px;
        border: 0;
        border-radius: 12px;
        background: #1f6b4d;
        color: white;
        cursor: pointer;
        font: inherit;
        font-weight: 750;
      }
      button:focus-visible {
        outline: 3px solid rgba(31, 107, 77, 0.28);
        outline-offset: 3px;
      }
    </style>
    <div class="backdrop" role="presentation">
      <section aria-modal="true" class="dialog" role="dialog" aria-labelledby="betterme-warning-title">
        <div class="body">
          <div class="kicker">BetterMe reminder</div>
          <h1 id="betterme-warning-title">One minute left on ${escapeHtml(target)}</h1>
          <p>Your temporary access is almost over. Confirm that you still want to spend this final minute here.</p>
          <button type="button">OK, continue deliberately</button>
        </div>
      </section>
    </div>
  `;

  shadow.querySelector("button")?.addEventListener("click", removeWarningOverlay);
  document.documentElement.append(warningHost);
}

function removeWarningOverlay(): void {
  warningHost?.remove();
  warningHost = undefined;
}

function clearTimers(): void {
  if (redirectTimer) {
    window.clearTimeout(redirectTimer);
    redirectTimer = undefined;
  }
  if (warningTimer) {
    window.clearTimeout(warningTimer);
    warningTimer = undefined;
  }
}

function registerStorageRefresh(): void {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
    return;
  }
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    void installExpiryGuard();
  });
}

function isSupportedPage(): boolean {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
