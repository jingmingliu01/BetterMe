import type { BlockedTarget } from "../shared/types";
import { normalizeDomain, parseHttpUrl } from "./target-parser";

export function doesDomainMatch(hostname: string, domain: string): boolean {
  const normalizedHost = normalizeDomain(hostname);
  const normalizedDomain = normalizeDomain(domain);
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

export function doesExactUrlMatch(currentUrl: string, blockedUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const blocked = new URL(blockedUrl);
    current.hash = "";
    blocked.hash = "";
    return current.toString() === blocked.toString();
  } catch {
    return false;
  }
}

export function findMatchingTarget(url: string, targets: BlockedTarget[]): BlockedTarget | null {
  let parsed: URL;
  try {
    parsed = parseHttpUrl(url);
  } catch {
    return null;
  }
  return (
    targets.find((target) => {
      if (!target.enabled) {
        return false;
      }
      if (target.type === "domain") {
        return doesDomainMatch(parsed.hostname, target.value);
      }
      return doesExactUrlMatch(parsed.toString(), target.value);
    }) ?? null
  );
}
