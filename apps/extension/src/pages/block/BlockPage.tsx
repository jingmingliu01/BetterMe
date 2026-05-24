import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Clock, DoorOpen, MessageCircle, Settings } from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { getQueryParam, openExtensionPage, sendMessage } from "../shared/api";
import { useAsyncState } from "../shared/useAsyncState";
import type {
  AICheckSession,
  AICheckMessage,
  AIReadiness,
  BasicCooldown,
  BlockedTarget,
  BootstrapState,
  CheckpointDecision
} from "../../shared/types";
import { formatScore, getDecisionMeter } from "../../ai/decision-meter";
import { deriveAIReadiness, getAIReadinessMessage } from "../../ai/ai-readiness";
import { buildOpeningMessage } from "../../ai/prompt";
import { deriveAccessState, getActiveCooldownForTarget } from "../../blocking/access-state";
import { getCooldownClaimExpiresAt, isCooldownComplete } from "../../blocking/cooldowns";
import {
  AI_CHECK_SESSION_MAX_ASSISTANT_TURNS,
  BASIC_COOLDOWN_POLICIES,
  getEscalatedStrictness,
  STORAGE_KEYS
} from "../../shared/constants";
import "../shared/styles.css";

export function BlockPage() {
  const targetId = getQueryParam("targetId");
  const load = useCallback(() => sendMessage<BootstrapState>({ type: "bootstrap/getState" }), []);
  const { data, error, loading, refresh } = useAsyncState(load);
  const [session, setSession] = useState<AICheckSession | null>(null);
  const [messages, setMessages] = useState<AICheckMessage[]>([]);
  const [decision, setDecision] = useState<CheckpointDecision | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

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
        STORAGE_KEYS.settings,
        STORAGE_KEYS.blockedTargets,
        STORAGE_KEYS.unlocks,
        STORAGE_KEYS.cooldowns,
        STORAGE_KEYS.holds,
        STORAGE_KEYS.targetAttempts,
        STORAGE_KEYS.providerKeyRevision
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
  const aiReadiness = data
    ? deriveAIReadiness({
        settings: data.settings,
        providerKeyReady: selectedProviderReady,
        accessState,
        targetExists: Boolean(target)
      })
    : "missing_provider_key";
  const aiReady = aiReadiness === "ready";
  const activeCooldown = target ? getActiveCooldownForTarget(target.id, data?.cooldowns ?? [], now) : null;
  const completedCooldown =
    target && data
      ? data.cooldowns.find((cooldown) => cooldown.targetId === target.id && isCooldownComplete(cooldown, now))
      : null;
  const currentCooldownEscalation =
    target && data ? data.cooldownEscalations.find((item) => item.targetId === target.id) ?? null : null;
  const nextCooldownAttemptCount = (currentCooldownEscalation?.count ?? 0) + 1;
  const nextCooldownStrictness = data
    ? getEscalatedStrictness(data.settings.strictness, nextCooldownAttemptCount)
    : "balanced";
  const nextCooldownPolicy = BASIC_COOLDOWN_POLICIES[nextCooldownStrictness];
  const attemptUrlFromQuery = getQueryParam("attemptUrl");
  const attemptUrl =
    attemptUrlFromQuery ??
    (target ? getAttemptUrlForTarget(data?.targetAttempts ?? [], target.id, currentTabId) : null) ??
    (target ? getFallbackAttemptUrl(target) : null) ??
    null;
  const blockedReason = data ? getAIReadinessMessage(aiReadiness, data.settings.provider) : "";
  const aiCooldownRemainingMs =
    session?.status === "ai_cooling_down" && session.aiCooldownUntil
      ? new Date(session.aiCooldownUntil).getTime() - now.getTime()
      : 0;
  const aiCooldownActive = aiCooldownRemainingMs > 0;
  const aiCooldownReady = session?.status === "ai_cooling_down" && !aiCooldownActive;
  const aiSessionTerminal = Boolean(
    session &&
      (aiCooldownReady || ["allowed", "blocked", "expired", "provider_error", "schema_error", "completed"].includes(session.status))
  );
  const heldUntilTomorrow = accessState === "block_held_until_tomorrow";
  const aiPanelMode = heldUntilTomorrow ? "held_readonly" : aiCooldownActive ? "cooldown" : aiSessionTerminal ? "terminal" : "interactive";
  const composerDisabled = busy || !aiReady || aiCooldownActive || aiSessionTerminal || aiPanelMode === "held_readonly";

  useEffect(() => {
    if (!targetWasDeleted || !deletedTargetAttemptUrl) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.replace(deletedTargetAttemptUrl);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [deletedTargetAttemptUrl, targetWasDeleted]);

  useEffect(() => {
    if (!heldUntilTomorrow || !target) {
      return;
    }
    let cancelled = false;
    void sendMessage<{ session: AICheckSession | null; messages: AICheckMessage[]; decision: CheckpointDecision | null }>({
      type: "ai/getLatestBlockedSession",
      payload: { targetId: target.id }
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setSession(result.session);
        setMessages(result.messages);
        setDecision(result.decision);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setAiError(loadError instanceof Error ? loadError.message : "Could not load the last AI Check.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [heldUntilTomorrow, target]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages.length, busy, decision?.id, aiError, session?.status]);

  async function sendUserMessage() {
    if (aiPanelMode === "held_readonly") return;
    const content = input.trim();
    if (!content || (!session && !target)) return;
    const optimisticMessage: AICheckMessage = {
      id: `optimistic-${Date.now()}`,
      sessionId: session?.id ?? "pending-session",
      role: "user",
      source: "user",
      content,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, optimisticMessage]);
    setInput("");
    setBusy(true);
    setAiError(null);
    try {
      const result = session
        ? await sendMessage<{ session: AICheckSession; messages: AICheckMessage[]; decision: CheckpointDecision }>({
            type: "ai/sendMessage",
            payload: { sessionId: session.id, content }
          })
        : await sendMessage<{ session: AICheckSession; messages: AICheckMessage[]; decision: CheckpointDecision }>({
            type: "ai/startAndSend",
            payload: { targetId: target!.id, content }
          });
      setSession(result.session);
      setMessages(result.messages);
      setDecision(result.decision);
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
      subtitle="Pause before continuing. BetterMe checks whether this visit is deliberate."
    >
      {error && <p className="badge badge-danger">{error}</p>}
      <section className="grid two-col block-grid">
        <aside className="panel stack checkpoint-rail">
          <div className="section-heading">
            <span className="section-label">Current checkpoint</span>
            <h2>{formatAccessState(accessState)}</h2>
          </div>

          <div className="target-summary">
            <span className="muted">Blocked target</span>
            <strong>{target?.display ?? "No matching target"}</strong>
            {attemptUrl && (
              <details className="attempt-details">
                <summary>Attempted page</summary>
                <span>{attemptUrl}</span>
              </details>
            )}
          </div>

          <div className="status-list" aria-label="Checkpoint status">
            <StatusItem label="Strictness" value={data.settings.strictness} />
            <StatusItem label="Access" value={formatAccessState(accessState)} />
            <StatusItem label="AI Check" value={getAIReadinessLabel(aiReadiness)} muted={!aiReady} />
          </div>

          {!aiReady && (
            <div className="readiness-callout">
              <AlertCircle size={16} />
              <div>
                <strong>{getAIReadinessLabel(aiReadiness)}</strong>
                <p>{blockedReason}</p>
              </div>
            </div>
          )}

          <div className="checkpoint-actions stack">
            <button className="btn btn-primary" onClick={leave}>
              <DoorOpen size={16} /> Leave Site
            </button>
            {heldUntilTomorrow ? (
              <div className="cooldown-card stack cooldown-card-disabled">
                <div className="row space-between">
                  <strong>Basic Cooldown unavailable</strong>
                  <span className="badge badge-warn">Hold</span>
                </div>
                <p className="muted">AI Check has held this target until tomorrow.</p>
              </div>
            ) : activeCooldown ? (
              <div className="cooldown-card stack">
                <div className="row space-between">
                  <strong>Basic Cooldown</strong>
                  <span className="timer-value">{formatRemaining(new Date(activeCooldown.endsAt).getTime() - now.getTime())}</span>
                </div>
                <p className="muted">The site stays blocked while the timer runs.</p>
              </div>
            ) : completedCooldown ? (
              <div className="stack">
                <button className="btn" disabled={busy} onClick={completeCooldown}>
                  <Clock size={16} /> Continue for {formatDuration(getCooldownUnlockSeconds(completedCooldown))}
                </button>
                <p className="muted">
                  Claim window: {formatRemaining(getCooldownClaimExpiresAt(completedCooldown).getTime() - now.getTime())}
                </p>
              </div>
            ) : (
              <button className="btn" disabled={!target || busy} onClick={startCooldown}>
                <Clock size={16} /> Basic Cooldown {formatDuration(nextCooldownPolicy.cooldownSeconds)}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => openExtensionPage("settings.html")}>
              <Settings size={16} /> Settings
            </button>
          </div>

          {activeCooldown ? (
            <p className="microcopy">Cooldown does not change your blocked list. It only creates a short access window after waiting.</p>
          ) : null}
        </aside>

        <section className="panel stack ai-check-panel">
          <div className="ai-check-header">
            <div className="section-heading">
              <span className="section-label">AI Check</span>
              <h2>{aiPanelMode === "held_readonly" ? "AI Check is closed for today" : "Make the case to continue"}</h2>
            </div>
            <span className="turn-count">
              {session
                ? `${session.assistantTurnCount}/${session.maxAssistantTurns} turns`
                : aiPanelMode === "held_readonly"
                  ? "Closed"
                  : `0/${AI_CHECK_SESSION_MAX_ASSISTANT_TURNS} turns`}
            </span>
          </div>
          <p className="muted ai-check-guidance">
            {aiPanelMode === "held_readonly"
              ? "This target is held until tomorrow based on the last AI decision."
              : "Explain what you plan to do, how long it should take, and why this is worth opening now."}
          </p>

          <div className="message-list" ref={messageListRef}>
            {!session && target && aiPanelMode !== "held_readonly" && (
              <div className="message message-assistant">{buildOpeningMessage(target.display)}</div>
            )}
            {!session && target && aiPanelMode === "held_readonly" && (
              <div className="message message-assistant">
                AI Check is closed for today. BetterMe could not find the previous decision conversation for this target.
              </div>
            )}
            {!target && (
              <div className="message message-assistant">
                BetterMe could not find a matching blocked target for this checkpoint.
              </div>
            )}
            {messages.map((message) => (
              <div
                className={message.role === "user" ? "message message-user" : "message message-assistant"}
                key={message.id}
              >
                {message.content}
              </div>
            ))}
            {busy && (
              <div className="message message-assistant message-thinking" aria-live="polite">
                <span>AI is thinking</span>
                <span className="thinking-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}
            {decision && (
              <div className="decision-message">
                <DecisionSummary decision={decision} />
              </div>
            )}
          </div>

          {aiCooldownActive && (
            <div className="ai-cooldown-banner">
              <Clock size={17} />
              <div>
                <strong>AI Cooldown</strong>
                <p>{formatRemaining(aiCooldownRemainingMs)} before this AI Check ends.</p>
              </div>
            </div>
          )}
          {aiCooldownReady && (
            <div className="ai-cooldown-banner ai-cooldown-ready">
              <Clock size={17} />
              <div>
                <strong>AI Cooldown Complete</strong>
                <p>This checkpoint is complete. Leave the site or start a new checkpoint later.</p>
              </div>
            </div>
          )}
          {aiError && <p className="badge badge-danger">{aiError}</p>}
          <div
            className={composerDisabled ? "composer composer-disabled stack" : "composer stack"}
            data-disabled-reason={aiPanelMode === "held_readonly" ? "Closed until tomorrow" : "Unavailable"}
          >
            <textarea
              className="textarea"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!composerDisabled && input.trim()) {
                    void sendUserMessage();
                  }
                }
              }}
              disabled={composerDisabled}
              placeholder={
                aiPanelMode === "held_readonly"
                  ? "AI Check is closed until tomorrow."
                  : "Explain why this visit is deliberate and bounded..."
              }
            />
            <button
              className="btn btn-primary"
              onClick={sendUserMessage}
              disabled={composerDisabled || !input.trim()}
            >
              <MessageCircle size={16} /> {busy ? "Thinking..." : "Send"}
            </button>
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function StatusItem({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong className={muted ? "muted" : undefined}>{value}</strong>
    </div>
  );
}

function DecisionSummary({ decision }: { decision: CheckpointDecision }) {
  const meter = getDecisionMeter(decision);
  const [displayedMeter, setDisplayedMeter] = useState(() => ({
    value: 50,
    label: meter.label,
    zone: meter.zone
  }));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDisplayedMeter(meter));
    return () => window.cancelAnimationFrame(frame);
  }, [meter.label, meter.value]);

  return (
    <div className="decision-summary">
      <div className="decision-summary-header">
        <div className="decision-title">
          <span className="section-label">Latest decision</span>
          <strong>{formatDecisionLabel(decision.decision)}</strong>
        </div>
        <span className={decision.decision === "BLOCK" ? "badge badge-danger" : "badge"}>
          {formatDecisionBadge(decision.decision)}
        </span>
      </div>
      <div
        className={`decision-meter decision-meter-${displayedMeter.zone}`}
        aria-label={`AI judgment meter: ${displayedMeter.label}`}
      >
        <div className="decision-meter-labels">
          <span>Block</span>
          <strong>{displayedMeter.label}</strong>
          <span>Allow</span>
        </div>
        <div className="decision-meter-track">
          <span className="decision-meter-midpoint">AI Cooldown</span>
          <span className="decision-meter-fill" style={{ width: `${displayedMeter.value}%` }} />
          <span className="decision-meter-marker" style={{ left: `${displayedMeter.value}%` }} />
        </div>
      </div>
      <p>{decision.userFacingMessage}</p>
      <details className="decision-details">
        <summary>Decision details</summary>
        <dl>
          <div>
            <dt>Reason</dt>
            <dd>{formatReadableToken(decision.decisionReasonCategory)}</dd>
          </div>
          <div>
            <dt>Impulse</dt>
            <dd>{formatScore(decision.scores.impulse)}</dd>
          </div>
          <div>
            <dt>Deliberateness</dt>
            <dd>{formatScore(decision.scores.deliberateness)}</dd>
          </div>
          <div>
            <dt>Repeated reason</dt>
            <dd>{formatScore(decision.scores.repeatedReason)}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
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

function getAIReadinessLabel(readiness: AIReadiness): string {
  switch (readiness) {
    case "ready":
      return "Ready";
    case "missing_provider_key":
      return "Provider key needed";
    case "invalid_provider_model":
      return "Model unavailable";
    case "blocked_by_hold":
      return "Held until tomorrow";
    case "cooling_down":
      return "Cooling down";
    case "temporarily_unlocked":
      return "Already unlocked";
    case "target_missing":
      return "Target missing";
    default:
      return "Unavailable";
  }
}

function formatDecisionLabel(decision: CheckpointDecision["decision"]): string {
  switch (decision) {
    case "ALLOW":
      return "Temporary access approved";
    case "AI_COOLDOWN":
      return "Pause before trying again";
    case "ASK_MORE":
      return "One more answer needed";
    case "BLOCK":
      return "Blocked until tomorrow";
    default:
      return decision;
  }
}

function formatDecisionBadge(decision: CheckpointDecision["decision"]): string {
  return decision === "AI_COOLDOWN" ? "AI Cooldown" : decision;
}

function formatReadableToken(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function getCooldownUnlockSeconds(cooldown: BasicCooldown): number {
  return Math.round(cooldown.unlockMinutes * 60);
}

function getFallbackAttemptUrl(target: BlockedTarget): string | null {
  if (target.type === "exactUrl") {
    return target.value;
  }
  return `https://${target.value}/`;
}
