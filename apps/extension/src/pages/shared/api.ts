import type { ExtensionMessage, ExtensionResult } from "../../shared/types";

function hasRuntimeMessaging(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.sendMessage);
}

export async function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  let result: ExtensionResult<T>;
  if (hasRuntimeMessaging()) {
    result = await withTimeout(chrome.runtime.sendMessage(message), 4_000, "BetterMe background did not respond.");
  } else {
    const { routeMessage } = await import("../../background/message-router");
    result = (await routeMessage(message)) as ExtensionResult<T>;
  }

  if (!result.ok) {
    throw new Error(result.error ?? "BetterMe request failed.");
  }
  return result.data as T;
}

export function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function openExtensionPage(path: "settings.html" | "review.html" | "onboarding.html"): void {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    const url = chrome.runtime.getURL(path);
    if (chrome.tabs?.create) {
      void chrome.tabs.create({ url });
      return;
    }
    window.open(url, "_blank");
    return;
  }
  window.open(`/${path}`, "_blank");
}

export async function getCurrentActiveTab(): Promise<{ id?: number; url?: string; title?: string } | null> {
  if (typeof chrome !== "undefined" && chrome.tabs?.query) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab ? { id: tab.id, url: tab.url, title: tab.title } : null;
  }
  return { url: window.location.href, title: document.title };
}

export async function reloadTab(tabId?: number): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.tabs?.reload && tabId) {
    await chrome.tabs.reload(tabId);
    window.close();
    return;
  }
  window.location.reload();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}
