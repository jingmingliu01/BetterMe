import type { ExtensionResult, PageAccessInfo } from "../shared/types";

let redirectTimer: number | undefined;
let warningTimer: number | undefined;
let warningHost: HTMLElement | undefined;
let warnedUnlockId: string | null = null;
let restorePageOverflow: (() => void) | undefined;

const blockedInteractionEvents = [
  "auxclick",
  "click",
  "contextmenu",
  "dblclick",
  "keydown",
  "mousedown",
  "mousemove",
  "mouseup",
  "pointercancel",
  "pointerdown",
  "pointermove",
  "pointerup",
  "touchcancel",
  "touchend",
  "touchmove",
  "touchstart",
  "wheel"
] as const;

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
  applyHostStyles(warningHost);
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
        pointer-events: none;
      }
      dialog {
        width: min(560px, calc(100vw - 48px));
        max-width: calc(100vw - 48px);
        margin: auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: #18201b;
        font: inherit;
        pointer-events: auto;
      }
      dialog::backdrop {
        background: rgba(13, 24, 18, 0.52);
        backdrop-filter: blur(8px);
      }
      .shell {
        display: grid;
        place-items: center;
      }
      .dialog {
        width: 100%;
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
      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 2px;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 14px;
        border: 0;
        border-radius: 10px;
        background: #ddebe3;
        color: #173327;
        cursor: pointer;
        font: inherit;
        font-weight: 750;
        transition:
          transform 160ms ease,
          background 160ms ease;
      }
      .btn:hover {
        transform: translateY(-1px);
        background: #cfe3d7;
      }
      .btn-primary {
        background: #1f6b4d;
        color: #fff;
      }
      .btn-primary:hover {
        background: #18563e;
      }
      .btn:focus-visible {
        outline: 3px solid rgba(31, 107, 77, 0.28);
        outline-offset: 2px;
      }
      @media (max-width: 520px) {
        .actions {
          grid-template-columns: 1fr;
        }
      }
    </style>
    <dialog aria-labelledby="betterme-warning-title">
      <div class="shell" role="presentation">
        <section class="dialog" role="document">
        <div class="body">
          <div class="kicker">BetterMe reminder</div>
          <h1 id="betterme-warning-title">One minute left on ${escapeHtml(target)}</h1>
          <p>You can leave now and keep control, or finish the time you already unlocked. The timer keeps running either way.</p>
          <div class="actions">
            <button class="btn btn-primary" data-betterme-warning-action="leave" type="button">Leave Site</button>
            <button class="btn" data-betterme-warning-action="finish" type="button">Finish My Time</button>
          </div>
        </div>
      </section>
      </div>
    </dialog>
  `;

  document.documentElement.append(warningHost);
  lockPageInteraction();

  const dialog = shadow.querySelector("dialog");
  dialog?.addEventListener("cancel", (event) => event.preventDefault());
  try {
    dialog?.showModal();
  } catch {
    dialog?.setAttribute("open", "");
  }
  shadow.querySelector<HTMLButtonElement>('[data-betterme-warning-action="leave"]')?.focus();
}

function removeWarningOverlay(): void {
  restorePageOverflow?.();
  restorePageOverflow = undefined;
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

function applyHostStyles(host: HTMLElement): void {
  host.style.setProperty("all", "initial", "important");
  host.style.setProperty("position", "fixed", "important");
  host.style.setProperty("inset", "0", "important");
  host.style.setProperty("z-index", "2147483647", "important");
  host.style.setProperty("display", "block", "important");
  host.style.setProperty("pointer-events", "none", "important");
}

function lockPageInteraction(): void {
  const previousHtmlOverflow = document.documentElement.style.overflow;
  const previousBodyOverflow = document.body?.style.overflow;
  document.documentElement.style.overflow = "hidden";
  if (document.body) {
    document.body.style.overflow = "hidden";
  }

  blockedInteractionEvents.forEach((eventName) => {
    window.addEventListener(eventName, blockPageInteraction, { capture: true, passive: false });
  });

  restorePageOverflow = () => {
    document.documentElement.style.overflow = previousHtmlOverflow;
    if (document.body && previousBodyOverflow !== undefined) {
      document.body.style.overflow = previousBodyOverflow;
    }
    blockedInteractionEvents.forEach((eventName) => {
      window.removeEventListener(eventName, blockPageInteraction, { capture: true });
    });
  };
}

function blockPageInteraction(event: Event): void {
  const warningButton = event.composedPath().find(isWarningActionButton);
  if (warningButton && isButtonAction(event)) {
    handleWarningAction(warningButton.dataset.bettermeWarningAction);
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

function isWarningActionButton(value: EventTarget): value is HTMLButtonElement {
  return value instanceof HTMLButtonElement && typeof value.dataset.bettermeWarningAction === "string";
}

function isButtonAction(event: Event): boolean {
  if (event.type === "click") {
    return true;
  }
  if (event.type !== "keydown" || !(event instanceof KeyboardEvent)) {
    return false;
  }
  return event.key === "Enter" || event.key === " ";
}

function handleWarningAction(action: string | undefined): void {
  if (action === "leave") {
    leaveFromWarning();
    return;
  }
  if (action === "finish") {
    removeWarningOverlay();
  }
}

function leaveFromWarning(): void {
  removeWarningOverlay();
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = "about:blank";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
