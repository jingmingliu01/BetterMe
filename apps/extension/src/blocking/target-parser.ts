import { createId, nowIso } from "../shared/id";
import type { BlockedTarget, BlockedTargetType } from "../shared/types";

export function parseHttpUrl(input: string): URL {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (!isSupportedProtocol(url)) {
    throw new Error("Only http and https URLs are supported.");
  }
  return url;
}

export function isSupportedProtocol(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

export function normalizeDomain(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
}

export function normalizeDomainTarget(input: string): BlockedTarget {
  const url = parseHttpUrl(input);
  const domain = normalizeDomain(url.hostname);
  if (!domain.includes(".")) {
    throw new Error("Please enter a valid domain, for example example.com.");
  }

  return {
    id: createId("target"),
    type: "domain",
    value: domain,
    display: domain,
    createdAt: nowIso(),
    enabled: true,
    source: "manual",
    category: "custom"
  };
}

export function normalizeExactUrlTarget(input: string): BlockedTarget {
  const url = parseHttpUrl(input);
  url.hash = "";
  return {
    id: createId("target"),
    type: "exactUrl",
    value: url.toString(),
    display: url.toString(),
    createdAt: nowIso(),
    enabled: true,
    source: "manual",
    category: "custom"
  };
}

export function createBlockedTarget(input: string, targetType: BlockedTargetType): BlockedTarget {
  return targetType === "domain" ? normalizeDomainTarget(input) : normalizeExactUrlTarget(input);
}

export function getDisplayTarget(target: BlockedTarget): string {
  return target.display || target.value;
}
