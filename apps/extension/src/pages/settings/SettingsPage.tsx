import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Link2, ShieldPlus, Trash2 } from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { sendMessage } from "../shared/api";
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
import type { BlockedTarget, BlockedTargetType, BootstrapState, ProviderId, StrictnessLevel } from "../../shared/types";
import "../shared/styles.css";

const REMOVE_CONFIRMATION_PHRASE = "I choose to remove this block";
const REMOVE_CONFIRMATION_WAIT_MS = 10_000;

export function SettingsPage() {
  const load = useCallback(() => sendMessage<BootstrapState>({ type: "bootstrap/getState" }), []);
  const { data, error, loading, refresh } = useAsyncState(load);
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
    await sendMessage<BlockedTarget[]>({
      type: "blockedTargets/add",
      payload: { input: siteInput, targetType }
    });
    setSiteInput("");
    await refresh();
  }

  async function updateSettings(patch: { strictness?: StrictnessLevel; provider?: ProviderId; model?: string }) {
    await sendMessage({ type: "settings/update", payload: patch });
    await refresh();
  }

  async function saveKey(key: string) {
    await sendMessage({
      type: "provider/saveApiKey",
      payload: { provider: data?.settings.provider ?? "openai", apiKey: key.trim() }
    });
    setApiKey("");
    await refresh();
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
    await sendMessage({
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
    await refresh();
  }

  if (loading || !data) {
    return <AppShell title="Settings" subtitle="Loading local BetterMe state..." />;
  }

  const providerKeySaved = data.providerKeys[data.settings.provider];
  const cooldownPolicy = BASIC_COOLDOWN_POLICIES[data.settings.strictness];
  const removeWaitRemainingMs =
    removeConfirmationStartedAt === null
      ? REMOVE_CONFIRMATION_WAIT_MS
      : Math.max(0, removeConfirmationStartedAt + REMOVE_CONFIRMATION_WAIT_MS - removeConfirmationNow);
  const removeCanProceed =
    Boolean(confirmingTarget) && removeWaitRemainingMs === 0 && removeConfirmationText === REMOVE_CONFIRMATION_PHRASE;

  return (
    <AppShell title="BetterMe Settings" subtitle="Manage blocked sites, AI Check provider settings, and local data.">
      {error && <p className="badge badge-danger">{error}</p>}
      <section className="grid two-col">
        <div className="panel stack">
          <h2>Blocked Sites</h2>
          <p className="muted">Domain blocks the site and all subdomains. Exact URL only blocks this one page.</p>
          <input
            className="input"
            value={siteInput}
            onChange={(event) => setSiteInput(event.target.value)}
            placeholder="example.com or https://example.com/path"
          />
          <button className="btn btn-primary" onClick={() => addTarget("domain")}>
            <ShieldPlus size={16} /> {BLOCK_TARGET_ACTION_LABELS.domain}
          </button>
          <button className="btn" onClick={() => addTarget("exactUrl")}>
            <Link2 size={16} /> {BLOCK_TARGET_ACTION_LABELS.exactUrl}
          </button>
          <div className="stack">
            {data.blockedTargets.map((target) => (
              <div className="card row space-between" key={target.id}>
                <div>
                  <strong>{target.display}</strong>
                  <div className="muted">{target.type === "domain" ? "Domain + subdomains" : "Exact URL only"}</div>
                </div>
                <button
                  className="btn btn-ghost"
                  title="Review removal"
                  onClick={() => void openRemoveConfirmation(target)}
                >
                  <Trash2 size={16} /> Review removal
                </button>
              </div>
            ))}
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
        </div>

        <div className="panel stack">
          <h2>Checkpoint Rules</h2>
          <p className="muted">Strictness controls Basic Cooldown timing and AI Check access caps.</p>

          <label className="stack">
            <span>Strictness</span>
            <select
              className="select"
              value={data.settings.strictness}
              onChange={(event) => updateSettings({ strictness: event.target.value as StrictnessLevel })}
            >
              {Object.entries(STRICTNESS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="muted">
              Cooldown {formatDuration(cooldownPolicy.cooldownSeconds)} · Continue{" "}
              {formatDuration(cooldownPolicy.unlockSeconds)}
            </span>
          </label>
          <div className="card stack">
            <div>
              <strong>{STRICTNESS_LABELS[data.settings.strictness]}</strong>
              <p className="muted">{STRICTNESS_DESCRIPTIONS[data.settings.strictness]}</p>
            </div>
            <div className="stack compact-stack">
              {STRICTNESS_ORDER.map((level) => {
                const policy = BASIC_COOLDOWN_POLICIES[level];
                return (
                  <div className="row space-between strictness-row" key={level}>
                    <span>{STRICTNESS_LABELS[level]}</span>
                    <span className="muted">
                      {formatDuration(policy.cooldownSeconds)} cooldown · {formatDuration(policy.unlockSeconds)} access ·{" "}
                      {formatDuration(policy.claimWindowSeconds)} claim
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="muted">
              AI ALLOW is capped at {STRICTNESS_UNLOCK_CAP_MINUTES[data.settings.strictness]}m. Repeated cooldowns on
              the same target within {formatDuration(COOLDOWN_ESCALATION_WINDOW_SECONDS)} temporarily step up to the
              next stricter preset.
            </p>
          </div>

          <h2>AI Provider</h2>
          <p className="muted">Save your own provider key locally to enable live AI decisions.</p>

          <div className="grid two-col">
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
                onChange={(event) => updateSettings({ model: event.target.value })}
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
              onClick={async () => {
                await sendMessage({ type: "provider/deleteApiKey", payload: { provider: data.settings.provider } });
                await refresh();
              }}
            >
              Delete Key
            </button>
          </div>
          <p className={providerKeySaved ? "inline-status" : "inline-error"}>
            {providerKeySaved
              ? `${provider.label} key is saved on this device.`
              : `Save a ${provider.label} key before using AI Check.`}
          </p>

          <div className="card stack">
            <h3>Local Data</h3>
            <p className="muted">Export/delete uses only local extension data. No browser history or page content is read.</p>
            <div className="row">
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
                  await refresh();
                }}
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
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
