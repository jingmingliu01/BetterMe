import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, DoorOpen, MessageSquare, Settings, TestTube2 } from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { getQueryParam, openExtensionPage, sendMessage } from "../shared/api";
import { useAsyncState } from "../shared/useAsyncState";
import type {
  AITrack,
  AITrackMessage,
  BlockedTarget,
  BootstrapState,
  CheckpointDecision
} from "../../shared/types";
import { buildOpeningMessage } from "../../ai/prompt";
import { deriveAIAvailability, deriveAccessState, getActiveCooldownForTarget } from "../../blocking/access-state";
import { isCooldownComplete } from "../../blocking/cooldowns";
import { ACCESS_TIMING, STORAGE_KEYS } from "../../shared/constants";
import "../shared/styles.css";

export function BlockPage() {
  const targetId = getQueryParam("targetId");
  const load = useCallback(() => sendMessage<BootstrapState>({ type: "bootstrap/getState" }), []);
  const { data, error, loading, refresh } = useAsyncState(load);
  const [track, setTrack] = useState<AITrack | null>(null);
  const [messages, setMessages] = useState<AITrackMessage[]>([]);
  const [decision, setDecision] = useState<CheckpointDecision | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.tabs?.getCurrent) {
      return;
    }
    void chrome.tabs.getCurrent().then((tab) => {
      setCurrentTabId(tab?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return;
    }
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local") {
        return;
      }
      const watchedKeys = [
        STORAGE_KEYS.blockedTargets,
        STORAGE_KEYS.unlocks,
        STORAGE_KEYS.cooldowns,
        STORAGE_KEYS.holds,
        STORAGE_KEYS.targetAttempts
      ];
      if (watchedKeys.some((key) => key in changes)) {
        void refresh();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const target = useMemo<BlockedTarget | null>(() => {
    if (!data) return null;
    if (targetId) {
      return data.blockedTargets.find((item) => item.id === targetId) ?? null;
    }
    return data.blockedTargets[0] ?? null;
  }, [data, targetId]);
  const deletedTargetAttemptUrl = targetId
    ? getAttemptUrlForTarget(data?.targetAttempts ?? [], targetId, currentTabId)
    : null;
  const targetWasDeleted = Boolean(data && targetId && !target);

  const selectedProviderReady = data ? data.providerKeys[data.settings.provider] : false;
  const accessState = data
    ? deriveAccessState({ target, unlocks: data.unlocks, cooldowns: data.cooldowns, holds: data.holds, now })
    : "blocked";
  const aiAvailability = data
    ? deriveAIAvailability({
        license: data.settings.license,
        providerKeyReady: selectedProviderReady,
        accessState
      })
    : "locked_free";
  const aiReady = Boolean(data && target && aiAvailability === "ready" && accessState !== "cooling_down");
  const activeCooldown = target ? getActiveCooldownForTarget(target.id, data?.cooldowns ?? [], now) : null;
  const completedCooldown =
    target && data
      ? data.cooldowns.find((cooldown) => cooldown.targetId === target.id && isCooldownComplete(cooldown, now))
      : null;
  const attemptUrlFromQuery = getQueryParam("attemptUrl");
  const attemptUrl =
    attemptUrlFromQuery ??
    (target ? getAttemptUrlForTarget(data?.targetAttempts ?? [], target.id, currentTabId) : null) ??
    (target ? getFallbackAttemptUrl(target) : null) ??
    null;
  const blockedReason = getAIBlockedReason(aiAvailability);

  useEffect(() => {
    if (!targetWasDeleted || !deletedTargetAttemptUrl) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.replace(deletedTargetAttemptUrl);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [deletedTargetAttemptUrl, targetWasDeleted]);

  async function startTrack() {
    if (!target) return;
    setBusy(true);
    setAiError(null);
    try {
      const result = await sendMessage<{ track: AITrack; messages: AITrackMessage[] }>({
        type: "ai/startTrack",
        payload: { targetId: target.id }
      });
      setTrack(result.track);
      setMessages(result.messages);
    } catch (startError) {
      setAiError(startError instanceof Error ? startError.message : "Could not start AI Track.");
    } finally {
      setBusy(false);
    }
  }

  async function sendUserMessage() {
    if (!track || !input.trim()) return;
    setBusy(true);
    setAiError(null);
    try {
      const result = await sendMessage<{ track: AITrack; messages: AITrackMessage[]; decision: CheckpointDecision }>({
        type: "ai/sendMessage",
        payload: { trackId: track.id, content: input }
      });
      setTrack(result.track);
      setMessages(result.messages);
      setDecision(result.decision);
      setInput("");
      await refresh();
      if (result.decision.decision === "ALLOW" && attemptUrl) {
        window.setTimeout(() => {
          window.location.href = attemptUrl;
        }, 700);
      }
    } catch (sendError) {
      setAiError(sendError instanceof Error ? sendError.message : "AI request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startCooldown() {
    if (!target) return;
    setBusy(true);
    try {
      await sendMessage({ type: "blocking/startCooldown", payload: { targetId: target.id } });
      await refresh();
      setNow(new Date());
    } catch (cooldownError) {
      setAiError(cooldownError instanceof Error ? cooldownError.message : "Could not start cooldown.");
    } finally {
      setBusy(false);
    }
  }

  async function completeCooldown() {
    if (!completedCooldown) return;
    setBusy(true);
    try {
      const result = await sendMessage<{ attemptUrl?: string | null }>({
        type: "blocking/completeCooldown",
        payload: { cooldownId: completedCooldown.id }
      });
      window.location.href = result.attemptUrl ?? attemptUrl ?? "/";
    } catch (cooldownError) {
      setAiError(cooldownError instanceof Error ? cooldownError.message : "Could not complete cooldown.");
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "about:blank";
    }
  }

  if (loading || !data) {
    return <AppShell title="Blocked" subtitle="Loading BetterMe checkpoint..." />;
  }

  if (targetWasDeleted) {
    return (
      <AppShell title="No longer blocked" subtitle="This site was removed from BetterMe's blocked list.">
        <section className="panel stack">
          <h2>Access Restored</h2>
          <p className="muted">
            BetterMe no longer has a matching blocked target for this checkpoint. You can continue to the original page.
          </p>
          <button className="btn btn-primary" onClick={() => continueAfterTargetDeleted(deletedTargetAttemptUrl)}>
            Continue
          </button>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={target ? `Blocked: ${target.display}` : "Blocked"}
      subtitle="Convince the AI before you continue — and it remembers your excuses."
    >
      {error && <p className="badge badge-danger">{error}</p>}
      <section className="grid two-col">
        <aside className="panel stack">
          <h2>Checkpoint</h2>
          <div className="row">
            <span className="badge">{data.settings.strictness}</span>
            <span className="badge badge-warn">{formatAccessState(accessState)}</span>
            <span className={aiReady ? "badge" : "badge badge-warn"}>{aiReady ? "AI ready" : "AI locked"}</span>
          </div>
          {!aiReady && <p className="muted">{blockedReason}</p>}
          {attemptUrl && <p className="muted">Attempted URL: {attemptUrl}</p>}
          <button className="btn btn-primary" onClick={leave}>
            <DoorOpen size={16} /> Leave Site
          </button>
          {activeCooldown ? (
            <div className="card stack">
              <h3>Basic Cooldown</h3>
              <p className="muted">Wait before deciding. The site is still blocked.</p>
              <strong>{formatRemaining(new Date(activeCooldown.endsAt).getTime() - now.getTime())}</strong>
            </div>
          ) : completedCooldown ? (
            <button className="btn" disabled={busy} onClick={completeCooldown}>
              <Clock size={16} /> Continue for {formatDuration(ACCESS_TIMING.basicCooldownUnlockSeconds)}
            </button>
          ) : (
            <button className="btn" disabled={!target || busy} onClick={startCooldown}>
              <Clock size={16} /> Basic Cooldown {formatDuration(ACCESS_TIMING.basicCooldownSeconds)}
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => openExtensionPage("settings.html")}>
            <Settings size={16} /> Settings
          </button>
          <button className="btn btn-ghost" onClick={() => openExtensionPage("review.html")}>
            <TestTube2 size={16} /> AI PM Review
          </button>
          {decision && (
            <div className="card stack">
              <h3>Final/Latest Decision</h3>
              <span className={decision.decision === "BLOCK" ? "badge badge-danger" : "badge"}>{decision.decision}</span>
              <p className="muted">{decision.userFacingMessage}</p>
              <pre className="code">{JSON.stringify(decision.scores, null, 2)}</pre>
            </div>
          )}
        </aside>

        <section className="panel stack">
          <div className="row space-between">
            <h2>AI Check Chatbot</h2>
            {track && (
              <span className="badge">
                {track.assistantTurnCount}/{track.maxAssistantTurns} turns
              </span>
            )}
          </div>

          <div className="message-list">
            {!track && target && (
              <div className="message message-assistant">{buildOpeningMessage(target.display)}</div>
            )}
            {messages.map((message) => (
              <div
                className={message.role === "user" ? "message message-user" : "message message-assistant"}
                key={message.id}
              >
                {message.content}
              </div>
            ))}
          </div>

          {aiError && <p className="badge badge-danger">{aiError}</p>}
          {!track ? (
            <button className="btn btn-primary" disabled={!aiReady || busy} onClick={startTrack}>
              <MessageSquare size={16} /> Start AI Track
            </button>
          ) : (
            <div className="stack">
              <textarea
                className="textarea"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={busy || ["allowed", "blocked", "expired", "provider_error"].includes(track.status)}
                placeholder="Explain why this visit is deliberate and bounded..."
              />
              <button className="btn btn-primary" onClick={sendUserMessage} disabled={busy || !input.trim()}>
                Send
              </button>
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}

function getAIBlockedReason(aiAvailability: string): string {
  switch (aiAvailability) {
    case "locked_free":
      return "AI Check requires Lifetime License.";
    case "missing_provider_key":
      return "Provider API key or Demo AI is not configured.";
    case "blocked_by_hold":
      return "This target is blocked until tomorrow.";
    default:
      return "";
  }
}

function continueAfterTargetDeleted(attemptUrl: string | null): void {
  if (attemptUrl) {
    window.location.replace(attemptUrl);
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = "about:blank";
}

function getAttemptUrlForTarget(
  attempts: BootstrapState["targetAttempts"],
  targetId: string,
  tabId: number | null
): string | null {
  const tabAttempt =
    tabId === null ? null : attempts.find((attempt) => attempt.targetId === targetId && attempt.tabId === tabId);
  const targetAttempt = attempts.find((attempt) => attempt.targetId === targetId);
  return tabAttempt?.attemptUrl ?? targetAttempt?.attemptUrl ?? null;
}

function formatAccessState(accessState: string): string {
  switch (accessState) {
    case "cooling_down":
      return "Cooling down";
    case "temporarily_unlocked":
      return "Temporarily unlocked";
    case "block_held_until_tomorrow":
      return "Blocked until tomorrow";
    case "not_blocked":
      return "Not blocked";
    default:
      return "Blocked";
  }
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function getFallbackAttemptUrl(target: BlockedTarget): string | null {
  if (target.type === "exactUrl") {
    return target.value;
  }
  return `https://${target.value}/`;
}
