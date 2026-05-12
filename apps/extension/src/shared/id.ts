export function createId(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
