import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { openExtensionPage, sendMessage } from "../shared/api";
import "../shared/styles.css";

export function OnboardingPage() {
  const [domain, setDomain] = useState("");

  async function finish() {
    if (domain.trim()) {
      await sendMessage({
        type: "blockedTargets/add",
        payload: { input: domain, targetType: "domain" }
      });
    }
    await sendMessage({ type: "settings/update", payload: { onboardingCompleted: true } });
    openExtensionPage("settings.html");
  }

  return (
    <AppShell
      title="Set up BetterMe"
      subtitle="Block first. AI Check comes alive after Lifetime unlock and provider setup."
    >
      <section className="grid three-col">
        <div className="card">
          <ShieldCheck />
          <h3>Privacy first</h3>
          <p className="muted">No full browser history, no page content, only blocked target metadata.</p>
        </div>
        <div className="card">
          <h3>Bounded AI Check</h3>
          <p className="muted">A track has max turns, max time, one structured decision, and local enforcement.</p>
        </div>
        <div className="card">
          <h3>AI PM workflow</h3>
          <p className="muted">Review bad cases, classify root cause, and convert failures into eval cases.</p>
        </div>
      </section>
      <section className="panel stack">
        <h2>Add your first blocked site</h2>
        <input
          className="input"
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="example.com"
        />
        <button className="btn btn-primary" onClick={finish}>
          Continue <ArrowRight size={16} />
        </button>
      </section>
    </AppShell>
  );
}
