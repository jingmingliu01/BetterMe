type StorageArea = typeof chrome.storage.local;

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

function getChromeLocal(): StorageArea {
  return chrome.storage.local;
}

export async function getLocalValue<T>(key: string, fallback: T): Promise<T> {
  if (hasChromeStorage()) {
    const result = (await getChromeLocal().get(key)) as Record<string, T | undefined>;
    return result[key] ?? fallback;
  }

  const raw = globalThis.localStorage?.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

export async function setLocalValue<T>(key: string, value: T): Promise<void> {
  if (hasChromeStorage()) {
    await getChromeLocal().set({ [key]: value });
    return;
  }

  globalThis.localStorage?.setItem(key, JSON.stringify(value));
}

export async function removeLocalValue(key: string): Promise<void> {
  if (hasChromeStorage()) {
    await getChromeLocal().remove(key);
    return;
  }

  globalThis.localStorage?.removeItem(key);
}

export async function clearBetterMeLocalData(): Promise<void> {
  if (hasChromeStorage()) {
    await getChromeLocal().clear();
    return;
  }

  Object.keys(globalThis.localStorage ?? {})
    .filter((key) => key.startsWith("betterme."))
    .forEach((key) => globalThis.localStorage?.removeItem(key));
}
