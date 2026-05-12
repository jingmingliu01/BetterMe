import { useCallback, useMemo, useState } from "react";
import { Database, KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { sendMessage } from "../shared/api";
import { useAsyncState } from "../shared/useAsyncState";
import { PROVIDERS, STRICTNESS_LABELS } from "../../shared/constants";
import type { BlockedTarget, BootstrapState, ProviderId, StrictnessLevel } from "../../shared/types";
import "../shared/styles.css";

export function SettingsPage() {
  const load = useCallback(() => sendMessage<BootstrapState>({ type: "bootstrap/getState" }), []);
  const { data, error, loading, refresh } = useAsyncState(load);
  const [siteInput, setSiteInput] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const provider = useMemo(
    () => PROVIDERS.find((item) => item.id === data?.settings.provider) ?? PROVIDERS[0],
    [data?.settings.provider]
  );

  async function addTarget(targetType: "domain" | "exactUrl") {
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
      payload: { provider: data?.settings.provider ?? "openai", apiKey: key }
    });
    setApiKey("");
    await refresh();
  }

  if (loading || !data) {
    return <AppShell title="Settings" subtitle="Loading local BetterMe state..." />;
  }

  return (
    <AppShell title="BetterMe Settings" subtitle="Manage blocked sites, local license, provider key, and AI PM mode.">
      {error && <p className="badge badge-danger">{error}</p>}
      <section className="grid two-col">
        <div className="panel stack">
          <h2>Blocked Sites</h2>
          <p className="muted">Default action blocks a domain and all subdomains. Exact URL is hidden under Advanced.</p>
          <input
            className="input"
            value={siteInput}
            onChange={(event) => setSiteInput(event.target.value)}
            placeholder="example.com or https://example.com/path"
          />
          <button className="btn btn-primary" onClick={() => addTarget("domain")}>
            <Plus size={16} /> Add Domain
          </button>
          <button className="btn btn-ghost" onClick={() => setAdvanced(!advanced)}>
            {advanced ? "Hide Advanced" : "Show Advanced"}
          </button>
          {advanced && (
            <button className="btn" onClick={() => addTarget("exactUrl")}>
              Add Exact URL Only
            </button>
          )}
          <div className="stack">
            {data.blockedTargets.map((target) => (
              <div className="card row space-between" key={target.id}>
                <div>
                  <strong>{target.display}</strong>
                  <div className="muted">{target.type === "domain" ? "Domain + subdomains" : "Exact URL only"}</div>
                </div>
                <button
                  className="btn btn-ghost"
                  title="Delete"
                  onClick={async () => {
                    await sendMessage({ type: "blockedTargets/delete", payload: { id: target.id } });
                    await refresh();
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel stack">
          <h2>AI Check Access</h2>
          <div className="row">
            <span className={data.settings.license.status === "lifetime_mock" ? "badge" : "badge badge-warn"}>
              {data.settings.license.status === "lifetime_mock" ? "Lifetime Mock Unlocked" : "Free Tier"}
            </span>
            <span className="badge">AI PM Mode {data.settings.aiPmMode ? "On" : "Off"}</span>
          </div>
          <div className="row">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await sendMessage({ type: "license/devUnlock" });
                await refresh();
              }}
            >
              <KeyRound size={16} /> Dev Unlock Lifetime
            </button>
            <button
              className="btn"
              onClick={async () => {
                await sendMessage({ type: "license/reset" });
                await refresh();
              }}
            >
              <RotateCcw size={16} /> Reset License
            </button>
          </div>

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
          </label>

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
              placeholder={data.providerKeys[data.settings.provider] ? "Saved locally, encrypted" : "Paste provider API key"}
            />
          </label>
          <div className="row">
            <button className="btn btn-primary" onClick={() => saveKey(apiKey)} disabled={!apiKey.trim()}>
              Save Key
            </button>
            <button className="btn" onClick={() => saveKey("demo-local-model")}>
              Enable Demo AI
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await sendMessage({ type: "provider/deleteApiKey", payload: { provider: data.settings.provider } });
                await refresh();
              }}
            >
              Delete Key
            </button>
          </div>

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
