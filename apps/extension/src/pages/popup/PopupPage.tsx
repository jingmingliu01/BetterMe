import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Globe2,
  Link2,
  RefreshCw,
  Settings,
  ShieldPlus
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentActiveTab, openExtensionPage, reloadTab, sendMessage } from "../shared/api";
import { getBlockedTargets, getUnlocks } from "../../storage/domain-store";
import { BLOCK_TARGET_ACTION_LABELS } from "../../shared/constants";
import type { BlockedTarget, BlockedTargetType, TemporaryUnlock } from "../../shared/types";
import "../shared/styles.css";

interface CurrentPage {
  tabId?: number;
  url?: string;
  targetId?: string;
  targetType?: BlockedTargetType;
  domain?: string;
  exactUrl?: string;
  supported: boolean;
  error?: string;
}

export function PopupPage() {
  const [currentPage, setCurrentPage] = useState<CurrentPage>({ supported: false });
  const [blockedTargets, setBlockedTargets] = useState<BlockedTarget[]>([]);
  const [unlocks, setUnlocks] = useState<TemporaryUnlock[]>([]);
  const [blockedListOpen, setBlockedListOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    void initializePopup();
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const isDomainBlocked = useMemo(() => {
    if (currentPage.targetId && currentPage.targetType === "domain") {
      return blockedTargets.some((target) => target.id === currentPage.targetId && target.enabled);
    }
    if (!currentPage.domain) {
      return false;
    }
    return blockedTargets.some(
      (target) => target.type === "domain" && target.value === currentPage.domain && target.enabled
    );
  }, [currentPage.domain, currentPage.targetId, currentPage.targetType, blockedTargets]);

  const isExactUrlBlocked = useMemo(() => {
    if (currentPage.targetId && currentPage.targetType === "exactUrl") {
      return blockedTargets.some((target) => target.id === currentPage.targetId && target.enabled);
    }
    if (!currentPage.exactUrl) {
      return false;
    }
    const exactUrl = normalizeExactUrl(currentPage.exactUrl);
    return blockedTargets.some(
      (target) => target.type === "exactUrl" && target.value === exactUrl && target.enabled
    );
  }, [currentPage.exactUrl, currentPage.targetId, currentPage.targetType, blockedTargets]);

  const activeUnlock = useMemo(() => {
    if (currentPage.targetId) {
      return unlocks.find((unlock) => unlock.targetId === currentPage.targetId) ?? null;
    }
    const target = blockedTargets.find((item) => item.type === "domain" && item.value === currentPage.domain);
    return target ? unlocks.find((unlock) => unlock.targetId === target.id) ?? null : null;
  }, [blockedTargets, currentPage.domain, currentPage.targetId, unlocks]);
  const currentPageStatus = isDomainBlocked
    ? "Domain checkpoint active"
    : isExactUrlBlocked
      ? "Exact URL checkpoint active"
      : "Not blocked yet";

  async function initializePopup() {
    await Promise.all([loadCurrentPage(), loadLocalSummary()]);
  }

  async function loadLocalSummary() {
    try {
      const [nextTargets, nextUnlocks] = await Promise.all([getBlockedTargets(), getUnlocks()]);
      setBlockedTargets(nextTargets);
      setUnlocks(nextUnlocks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not read local BetterMe data.");
    }
  }

  async function loadCurrentPage() {
    const tab = await getCurrentActiveTab();
    if (!tab?.url) {
      setCurrentPage({ supported: false, error: "No active tab found." });
      return;
    }
    try {
      const url = new URL(tab.url);
      if (url.protocol === "chrome-extension:" && url.pathname.endsWith("/block.html")) {
        const targetId = url.searchParams.get("targetId");
        const targets = await getBlockedTargets();
        const target = targets.find((item) => item.id === targetId);
        if (target) {
          setCurrentPage({
            tabId: tab.id,
            url: tab.url,
            targetId: target.id,
            targetType: target.type,
            domain: target.display,
            exactUrl: target.type === "exactUrl" ? target.value : undefined,
            supported: true
          });
          return;
        }
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        setCurrentPage({
          tabId: tab.id,
          url: tab.url,
          supported: false,
          error: "This page cannot be blocked. Open an http or https website first."
        });
        return;
      }
      setCurrentPage({
        tabId: tab.id,
        url: tab.url,
        domain: url.hostname.toLowerCase(),
        exactUrl: url.toString(),
        supported: true
      });
    } catch {
      setCurrentPage({ tabId: tab.id, url: tab.url, supported: false, error: "Current tab URL is invalid." });
    }
  }

  async function addCurrentTarget(targetType: BlockedTargetType) {
    const input = targetType === "domain" ? currentPage.domain : currentPage.exactUrl;
    if (!input) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await sendMessage({
        type: "blockedTargets/add",
        payload: { input, targetType }
      });
      setStatus(`${targetType === "domain" ? "Domain" : "Exact URL"} added. Reload the page to trigger BetterMe.`);
      await loadLocalSummary();
    } catch (addError) {
      setStatus(addError instanceof Error ? addError.message : "Could not add blocked target.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="popup-root">
      <header className="popup-header">
        <div className="popup-logo">
          <img className="popup-logo-icon" src="/icon.svg" alt="" aria-hidden="true" />
          <span>BetterMe</span>
        </div>
        <p>Create a checkpoint for the current page, then reload when you are ready to test it.</p>
      </header>

      <section className="popup-card stack">
        <div className="current-domain">
          <Globe2 size={18} />
          <div>
            <div className="muted">Current domain</div>
            <strong>{currentPage.domain ?? "Unsupported page"}</strong>
            <span>{currentPageStatus}</span>
          </div>
        </div>

        {activeUnlock && (
          <p className="inline-status">
            Browse time left: {formatRemaining(new Date(activeUnlock.expiresAt).getTime() - now.getTime())}
          </p>
        )}

        {(error || currentPage.error) && (
          <p className="inline-error">
            <AlertCircle size={16} /> {error ?? currentPage.error}
          </p>
        )}
        {status && <p className="inline-status">{status}</p>}

        <div className="popup-button-stack">
        <button
          className="btn btn-primary"
          disabled={!currentPage.supported || isDomainBlocked || busy}
          onClick={() => addCurrentTarget("domain")}
        >
          <ShieldPlus size={16} />{" "}
          {isDomainBlocked ? BLOCK_TARGET_ACTION_LABELS.alreadyBlocked : BLOCK_TARGET_ACTION_LABELS.domain}
        </button>
        <button
          className="btn"
          disabled={!currentPage.supported || !currentPage.exactUrl || isDomainBlocked || isExactUrlBlocked || busy}
          onClick={() => addCurrentTarget("exactUrl")}
        >
          <Link2 size={16} />{" "}
          {isDomainBlocked || isExactUrlBlocked ? BLOCK_TARGET_ACTION_LABELS.alreadyBlocked : BLOCK_TARGET_ACTION_LABELS.exactUrl}
        </button>
        <button className="btn" disabled={!currentPage.supported} onClick={() => reloadTab(currentPage.tabId)}>
          <RefreshCw size={16} /> Reload Page
        </button>
        </div>
      </section>

      <section className="popup-card blocked-summary-card">
        <button
          className="blocked-summary-button"
          type="button"
          aria-expanded={blockedListOpen}
          onClick={() => setBlockedListOpen((isOpen) => !isOpen)}
        >
          <span className="badge">{blockedTargets.length} blocked {blockedTargets.length === 1 ? "site" : "sites"}</span>
          {blockedListOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        </button>
        {blockedListOpen && (
          <div className="blocked-list">
            {blockedTargets.length === 0 ? (
              <p className="muted blocked-empty">No blocked sites yet.</p>
            ) : (
              blockedTargets.map((target) => (
                <div className="blocked-list-item" key={target.id}>
                  <span>{target.display}</span>
                  <small>{target.type === "domain" ? "Domain + subdomains" : "Exact URL only"}</small>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section className="popup-actions">
        <button className="btn btn-ghost" onClick={() => openExtensionPage("settings.html")}>
          <Settings size={16} /> Open Settings
        </button>
      </section>
    </main>
  );
}

function normalizeExactUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  return url.toString();
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
