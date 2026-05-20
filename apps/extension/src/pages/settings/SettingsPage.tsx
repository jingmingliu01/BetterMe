import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Database,
  KeyRound,
  Link2,
  ShieldCheck,
  ShieldPlus,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { openExtensionPage, sendMessage } from "../shared/api";
import { useAsyncState } from "../shared/useAsyncState";
import {
  BASIC_COOLDOWN_POLICIES,
  BLOCK_TARGET_ACTION_LABELS,
  COOLDOWN_ESCALATION_WINDOW_SECONDS,
  PROVIDERS,
  STRICTNESS_DESCRIPTIONS,
  STRICTNESS_LABELS,
  STRICTNESS_ORDER,
  STRICTNESS_UNLOCK_CAP_MINUTES
} from "../../shared/constants";
import type {
  BlockedTarget,
  BlockedTargetType,
  BootstrapState,
  ProviderId,
  StrictnessLevel,
  UserSettings
} from "../../shared/types";
import "../shared/styles.css";

const REMOVE_CONFIRMATION_PHRASE = "I choose to remove this block";
const REMOVE_CONFIRMATION_WAIT_MS = 10_000;

export function SettingsPage() {
  const load = useCallback(() => sendMessage<BootstrapState>({ type: "bootstrap/getState" }), []);
  const { data, error, loading, refresh, setData } = useAsyncState(load);
  const [siteInput, setSiteInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [confirmingTarget, setConfirmingTarget] = useState<BlockedTarget | null>(null);
  const [removeConfirmationText, setRemoveConfirmationText] = useState("");
  const [removeConfirmationStartedAt, setRemoveConfirmationStartedAt] = useState<number | null>(null);
  const [removeConfirmationNow, setRemoveConfirmationNow] = useState(() => Date.now());
  const provider = useMemo(
    () => PROVIDERS.find((item) => item.id === data?.settings.provider) ?? PROVIDERS[0],
    [data?.settings.provider]
  );

  useEffect(() => {
    if (!confirmingTarget) {
      return;
    }
    setRemoveConfirmationNow(Date.now());
    const timer = window.setInterval(() => setRemoveConfirmationNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [confirmingTarget]);

  async function addTarget(targetType: BlockedTargetType) {
    if (!siteInput.trim()) return;
    const blockedTargets = await sendMessage<BlockedTarget[]>({
      type: "blockedTargets/add",
      payload: { input: siteInput, targetType }
    });
    setSiteInput("");
    setData((current) => (current ? { ...current, blockedTargets } : current));
  }

  async function updateSettings(patch: { strictness?: StrictnessLevel; provider?: ProviderId; model?: string }) {
    const settings = await sendMessage<UserSettings>({ type: "settings/update", payload: patch });
    setData((current) => (current ? { ...current, settings } : current));
  }

  async function saveKey(key: string) {
    const providerKeys = await sendMessage<Record<ProviderId, boolean>>({
      type: "provider/saveApiKey",
      payload: { provider: data?.settings.provider ?? "openai", apiKey: key.trim() }
    });
    setApiKey("");
    setData((current) => (current ? { ...current, providerKeys } : current));
  }

  async function deleteKey() {
    if (!data) return;
    const providerKeys = await sendMessage<Record<ProviderId, boolean>>({
      type: "provider/deleteApiKey",
      payload: { provider: data.settings.provider }
    });
    setData((current) => (current ? { ...current, providerKeys } : current));
  }

  async function refreshKeepingScroll() {
    const scrollY = window.scrollY;
    await refresh();
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
  }

  async function openRemoveConfirmation(target: BlockedTarget) {
    setConfirmingTarget(target);
    setRemoveConfirmationText("");
    setRemoveConfirmationStartedAt(Date.now());
    setRemoveConfirmationNow(Date.now());
    await sendMessage({
      type: "behavior/logEvent",
      payload: {
        eventType: "blocked_target_remove_prompt_opened",
        targetId: target.id
      }
    });
  }

  async function cancelRemoveConfirmation() {
    if (confirmingTarget) {
      await sendMessage({
        type: "behavior/logEvent",
        payload: {
          eventType: "blocked_target_remove_cancelled",
          targetId: confirmingTarget.id,
          payload: {
            elapsedMs: removeConfirmationStartedAt ? Date.now() - removeConfirmationStartedAt : null
          }
        }
      });
    }
    setConfirmingTarget(null);
    setRemoveConfirmationText("");
    setRemoveConfirmationStartedAt(null);
  }

  async function removeConfirmedTarget() {
    if (!confirmingTarget) return;
    const blockedTargets = await sendMessage<BlockedTarget[]>({
      type: "blockedTargets/delete",
      payload: {
        id: confirmingTarget.id,
        confirmationElapsedMs: removeConfirmationStartedAt ? Date.now() - removeConfirmationStartedAt : undefined,
        confirmationPhraseAccepted: removeConfirmationText === REMOVE_CONFIRMATION_PHRASE
      }
    });
    setConfirmingTarget(null);
    setRemoveConfirmationText("");
    setRemoveConfirmationStartedAt(null);
    setData((current) => (current ? { ...current, blockedTargets } : current));
  }

  if (loading || !data) {
    return <AppShell title="Settings" subtitle="Loading local BetterMe state..." />;
  }

  const providerKeySaved = data.providerKeys[data.settings.provider];
  const cooldownPolicy = BASIC_COOLDOWN_POLICIES[data.settings.strictness];
  const blockedDomainCount = data.blockedTargets.filter((target) => target.type === "domain").length;
  const exactUrlCount = data.blockedTargets.length - blockedDomainCount;
  const removeWaitRemainingMs =
    removeConfirmationStartedAt === null
      ? REMOVE_CONFIRMATION_WAIT_MS
      : Math.max(0, removeConfirmationStartedAt + REMOVE_CONFIRMATION_WAIT_MS - removeConfirmationNow);
  const removeCanProceed =
    Boolean(confirmingTarget) && removeWaitRemainingMs === 0 && removeConfirmationText === REMOVE_CONFIRMATION_PHRASE;

  return (
    <AppShell title="BetterMe Settings" subtitle="Manage blocked sites, AI Check provider settings, and local data.">
      {error && <p className="badge badge-danger">{error}</p>}
      <section className="settings-layout">
        <aside className="panel settings-sidebar">
          <div className="section-heading">
            <span className="section-label">Settings overview</span>
            <h2>Local control</h2>
          </div>
          <div className="settings-summary-list">
            <SummaryItem label="Blocked sites" value={String(data.blockedTargets.length)} />
            <SummaryItem label="Strictness" value={STRICTNESS_LABELS[data.settings.strictness]} />
            <SummaryItem label="AI provider" value={providerKeySaved ? "Ready" : "Needs key"} muted={!providerKeySaved} />
          </div>
          <nav className="settings-nav" aria-label="Settings sections">
            <a href="#blocked-sites">
              <ShieldPlus size={16} /> Blocked Sites
            </a>
            <a href="#checkpoint-rules">
              <SlidersHorizontal size={16} /> Checkpoint Rules
            </a>
            <a href="#ai-provider">
              <KeyRound size={16} /> AI Provider
            </a>
            <a href="#local-data">
              <Database size={16} /> Local Data
            </a>
            <button className="settings-nav-button" type="button" onClick={() => openExtensionPage("review.html")}>
              <ClipboardCheck size={16} /> AI PM Review
            </button>
          </nav>
        </aside>

        <div className="settings-content stack">
          <section className="panel settings-section stack" id="blocked-sites">
            <SectionHeader
              kicker="Blocked Sites"
              title="Choose what BetterMe should intercept"
              description="Domain blocks cover subdomains. Exact URL blocks only one page."
            />
            <div className="settings-form-row">
              <input
                className="input"
                value={siteInput}
                onChange={(event) => setSiteInput(event.target.value)}
                placeholder="example.com or https://example.com/path"
              />
              <div className="button-pair">
                <button className="btn btn-primary" onClick={() => addTarget("domain")}>
                  <ShieldPlus size={16} /> {BLOCK_TARGET_ACTION_LABELS.domain}
                </button>
                <button className="btn" onClick={() => addTarget("exactUrl")}>
                  <Link2 size={16} /> {BLOCK_TARGET_ACTION_LABELS.exactUrl}
                </button>
              </div>
            </div>
            <div className="settings-meta-row">
              <span>{blockedDomainCount} domain blocks</span>
              <span>{exactUrlCount} exact URL blocks</span>
            </div>

            <div className="settings-list">
              {data.blockedTargets.length === 0 ? (
                <p className="settings-empty">No blocked sites yet. Add a domain to create your first checkpoint.</p>
              ) : (
                data.blockedTargets.map((target) => (
                  <div className="settings-list-row" key={target.id}>
                    <div>
                      <strong>{target.display}</strong>
                      <span>{target.type === "domain" ? "Domain + subdomains" : "Exact URL only"}</span>
                    </div>
                    <button
                      className="btn btn-ghost"
                      title="Review removal"
                      onClick={() => void openRemoveConfirmation(target)}
                    >
                      <Trash2 size={16} /> Review removal
                    </button>
                  </div>
                ))
              )}
            </div>
            {confirmingTarget && (
              <div className="removal-confirmation stack">
                <div>
                  <h3>Remove this blocked site?</h3>
                  <p className="muted">
                    This permanently removes {confirmingTarget.display} from your blocked list. BetterMe will stop
                    redirecting it, but the local behavior history stays available for future AI pattern checks.
                  </p>
                </div>
                <label className="stack">
                  <span>Type this sentence to confirm:</span>
                  <code className="inline-code">{REMOVE_CONFIRMATION_PHRASE}</code>
                  <input
                    className="input"
                    value={removeConfirmationText}
                    onChange={(event) => setRemoveConfirmationText(event.target.value)}
                    placeholder={REMOVE_CONFIRMATION_PHRASE}
                  />
                </label>
                <div className="row">
                  <button className="btn btn-primary" onClick={() => void cancelRemoveConfirmation()}>
                    Keep Blocked
                  </button>
                  <button className="btn btn-danger" disabled={!removeCanProceed} onClick={() => void removeConfirmedTarget()}>
                    <Trash2 size={16} />
                    {removeWaitRemainingMs > 0
                      ? `Remove in ${Math.ceil(removeWaitRemainingMs / 1000)}s`
                      : "Remove Permanently"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="panel settings-section stack" id="checkpoint-rules">
            <SectionHeader
              kicker="Checkpoint Rules"
              title="Tune the amount of friction"
              description="Strictness controls Basic Cooldown timing, temporary access, and AI ALLOW caps."
            />
            <div className="strictness-options" role="radiogroup" aria-label="Strictness">
              {STRICTNESS_ORDER.map((level) => {
                const policy = BASIC_COOLDOWN_POLICIES[level];
                const selected = data.settings.strictness === level;
                return (
                  <button
                    className={selected ? "strictness-option strictness-option-selected" : "strictness-option"}
                    key={level}
                    onClick={() => void updateSettings({ strictness: level })}
                    role="radio"
                    type="button"
                    aria-checked={selected}
                  >
                    <span className="strictness-option-main">
                      <strong>{STRICTNESS_LABELS[level]}</strong>
                      <span>{STRICTNESS_DESCRIPTIONS[level]}</span>
                    </span>
                    <span className="strictness-option-timing">
                      {formatDuration(policy.cooldownSeconds)} wait · {formatDuration(policy.unlockSeconds)} access ·{" "}
                      {formatDuration(policy.claimWindowSeconds)} claim
                    </span>
                    {selected && <ShieldCheck size={18} />}
                  </button>
                );
              })}
            </div>
            <div className="settings-note">
              Current mode gives {formatDuration(cooldownPolicy.cooldownSeconds)} cooldown and{" "}
              {formatDuration(cooldownPolicy.unlockSeconds)} post-cooldown access. AI ALLOW is capped at{" "}
              {STRICTNESS_UNLOCK_CAP_MINUTES[data.settings.strictness]}m. Repeated cooldowns on the same target within{" "}
              {formatDuration(COOLDOWN_ESCALATION_WINDOW_SECONDS)} temporarily step up one level.
            </div>
          </section>

          <section className="panel settings-section stack" id="ai-provider">
            <SectionHeader
              kicker="AI Provider"
              title="Use your own model key"
              description="Keys stay encrypted on this device. BetterMe sends only checkpoint context, not page content."
            />
            <p className={providerKeySaved ? "inline-status" : "inline-error"}>
              {providerKeySaved
                ? `${provider.label} key is saved on this device.`
                : `Save ${getArticle(provider.label)} ${provider.label} key before using AI Check.`}
            </p>

            <div className="grid two-col settings-provider-grid">
              <label className="stack">
                <span>Provider</span>
                <select
                  className="select"
                  value={data.settings.provider}
                  onChange={(event) => {
                    const nextProvider = PROVIDERS.find((item) => item.id === event.target.value) ?? PROVIDERS[0];
                    void updateSettings({ provider: nextProvider.id, model: nextProvider.defaultModel });
                  }}
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stack">
                <span>Model</span>
                <select
                  className="select"
                  value={data.settings.model}
                  onChange={(event) => void updateSettings({ model: event.target.value })}
                >
                  {provider.models.map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="stack">
              <span>API Key</span>
              <input
                className="input"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                type="password"
                placeholder={providerKeySaved ? "Saved locally, encrypted" : "Paste provider API key"}
              />
            </label>
            <div className="row">
              <button className="btn btn-primary" onClick={() => saveKey(apiKey)} disabled={!apiKey.trim()}>
                Save Key
              </button>
              <button
                className="btn btn-ghost"
                disabled={!providerKeySaved}
                onClick={() => void deleteKey()}
              >
                Delete Key
              </button>
            </div>
          </section>

          <section className="panel settings-section stack" id="local-data">
            <SectionHeader
              kicker="Local Data"
              title="Export or reset this device"
              description="Export/delete uses only local extension data. No browser history or page content is read."
            />
            <div className="local-data-actions">
              <button
                className="btn"
                onClick={async () => {
                  const exported = await sendMessage<object>({ type: "data/export" });
                  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
                  window.open(URL.createObjectURL(blob), "_blank");
                }}
              >
                <Database size={16} /> Export JSON
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await sendMessage({ type: "data/deleteAll" });
                  await refreshKeepingScroll();
                }}
              >
                Delete All
              </button>
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}

function SectionHeader({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <div className="settings-section-header">
      <div className="section-heading">
        <span className="section-label">{kicker}</span>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </div>
  );
}

function SummaryItem({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong className={muted ? "muted" : undefined}>{value}</strong>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}

function getArticle(label: string): "a" | "an" {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}
