import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, RotateCcw, Save } from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { sendMessage } from "../shared/api";
import { useAsyncState } from "../shared/useAsyncState";
import type {
  AICheckCase,
  AIDecision,
  AIPMReviewSession,
  BadCaseErrorType,
  BadCaseReview
} from "../../shared/types";
import "../shared/styles.css";

const ERROR_TYPES: Array<{ value: BadCaseErrorType; label: string }> = [
  { value: "over_allow", label: "Over allow" },
  { value: "over_block", label: "Over block" },
  { value: "under_ask", label: "Under ask" },
  { value: "unnecessary_ask", label: "Unnecessary ask" },
  { value: "wrong_reason_strength", label: "Wrong reason strength" },
  { value: "wrong_strictness_application", label: "Wrong strictness" },
  { value: "wrong_cooldown_duration", label: "Wrong cooldown" },
  { value: "unsafe_sensitive_advice", label: "Unsafe sensitive advice" },
  { value: "bad_tone", label: "Bad tone" },
  { value: "schema_or_format_failure", label: "Schema or format failure" }
];

const DECISIONS: AIDecision[] = ["ALLOW", "AI_COOLDOWN", "ASK_MORE", "BLOCK"];

export function ReviewPage() {
  const load = useCallback(() => sendMessage<AIPMReviewSession[]>({ type: "review/listSessions" }), []);
  const { data, error, loading, refresh } = useAsyncState(load);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expectedDecision, setExpectedDecision] = useState<AIDecision | "">("");
  const [errorTypes, setErrorTypes] = useState<BadCaseErrorType[]>([]);
  const [reviewerNote, setReviewerNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const sessions = data ?? [];
  const selected = useMemo(
    () => sessions.find((item) => item.session.id === selectedSessionId) ?? sessions[0] ?? null,
    [selectedSessionId, sessions]
  );
  const latestDecision = selected?.decisions.at(-1) ?? null;

  useEffect(() => {
    if (!selected) return;
    setSelectedSessionId(selected.session.id);
    setExpectedDecision(selected.badCase?.expectedDecision ?? "");
    setErrorTypes(selected.badCase?.errorTypes ?? []);
    setReviewerNote(selected.badCase?.reviewerNote ?? "");
  }, [selected?.session.id]);

  async function saveBadCase() {
    if (!selected) return;
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        expectedDecision: expectedDecision || null,
        errorTypes,
        reviewerNote
      };
      const badCase = selected.badCase
        ? await sendMessage<BadCaseReview>({
            type: "review/updateBadCase",
            payload: {
              id: selected.badCase.id,
              ...payload
            }
          })
        : await sendMessage<BadCaseReview>({
            type: "review/createBadCase",
            payload: {
              sessionId: selected.session.id,
              decisionId: latestDecision?.id ?? null,
              ...payload
            }
          });
      setStatus(`Saved bad case ${badCase.id}.`);
      await refresh();
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : "Could not save bad case.");
    } finally {
      setSaving(false);
    }
  }

  async function convertToEvalCase() {
    if (!selected?.badCase) return;
    setSaving(true);
    setStatus(null);
    try {
      const evalCase = await sendMessage<AICheckCase>({
        type: "review/convertBadCaseToEval",
        payload: { badCaseId: selected.badCase.id }
      });
      setStatus(`Created eval case ${evalCase.id}.`);
      await refresh();
    } catch (convertError) {
      setStatus(convertError instanceof Error ? convertError.message : "Could not convert bad case.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return <AppShell title="AI PM Review" subtitle="Loading local AI Check sessions..." />;
  }

  return (
    <AppShell title="AI PM Review" subtitle="Turn bad AI Check decisions into local eval cases.">
      {error && <p className="badge badge-danger">{error}</p>}
      {status && <p className="badge">{status}</p>}
      <section className="review-layout">
        <aside className="panel review-session-list stack">
          <div className="row space-between">
            <div className="section-heading">
              <span className="section-label">Sessions</span>
              <h2>Recent AI Checks</h2>
            </div>
            <button className="icon-btn" title="Refresh sessions" onClick={() => void refresh()}>
              <RotateCcw size={16} />
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="muted">No AI Check sessions yet.</p>
          ) : (
            sessions.map((item) => (
              <button
                className={
                  item.session.id === selected?.session.id ? "review-session-item review-session-item-selected" : "review-session-item"
                }
                key={item.session.id}
                onClick={() => setSelectedSessionId(item.session.id)}
              >
                <strong>{item.session.targetDisplay}</strong>
                <span>{formatDecision(item.session.finalDecision ?? item.decisions.at(-1)?.decision ?? null)}</span>
                <small>
                  {formatDate(item.session.startedAt)}
                  {item.badCase ? " · bad case" : ""}
                </small>
              </button>
            ))
          )}
        </aside>

        <section className="panel review-detail stack">
          {!selected ? (
            <p className="muted">Select a session to review.</p>
          ) : (
            <>
              <div className="review-detail-header">
                <div className="section-heading">
                  <span className="section-label">Session detail</span>
                  <h2>{selected.session.targetDisplay}</h2>
                </div>
                <div className="status-list review-status-list">
                  <StatusItem label="Strictness" value={selected.session.strictness ?? "unknown"} />
                  <StatusItem label="Actual" value={formatDecision(latestDecision?.decision ?? selected.session.finalDecision ?? null)} />
                  <StatusItem label="Turns" value={`${selected.session.assistantTurnCount}/${selected.session.maxAssistantTurns}`} />
                </div>
              </div>

              <div className="review-transcript" aria-label="AI Check transcript">
                {selected.messages.map((message) => (
                  <div className={message.role === "user" ? "message message-user" : "message message-assistant"} key={message.id}>
                    {message.content}
                  </div>
                ))}
              </div>

              {latestDecision && (
                <details className="review-json">
                  <summary>Decision JSON</summary>
                  <pre className="code">{JSON.stringify(latestDecision, null, 2)}</pre>
                </details>
              )}

              <div className="review-form stack">
                <div className="section-heading">
                  <span className="section-label">PM judgment</span>
                  <h2>{selected.badCase ? "Update bad case" : "Mark as bad case"}</h2>
                </div>
                <label className="stack">
                  <span>Expected decision</span>
                  <select
                    className="select"
                    value={expectedDecision}
                    onChange={(event) => setExpectedDecision(event.target.value as AIDecision | "")}
                  >
                    <option value="">Choose expected decision</option>
                    {DECISIONS.map((decision) => (
                      <option key={decision} value={decision}>
                        {formatDecision(decision)}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="review-error-grid">
                  <legend>Error type</legend>
                  {ERROR_TYPES.map((item) => (
                    <label key={item.value}>
                      <input
                        type="checkbox"
                        checked={errorTypes.includes(item.value)}
                        onChange={(event) => {
                          setErrorTypes((current) =>
                            event.target.checked
                              ? [...current, item.value]
                              : current.filter((value) => value !== item.value)
                          );
                        }}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </fieldset>

                <label className="stack">
                  <span>Reviewer note</span>
                  <textarea
                    className="textarea"
                    value={reviewerNote}
                    onChange={(event) => setReviewerNote(event.target.value)}
                    placeholder="Why was this decision wrong? What should the AI have done?"
                  />
                </label>

                <div className="row">
                  <button className="btn btn-primary" disabled={saving || errorTypes.length === 0} onClick={saveBadCase}>
                    <Save size={16} /> Save Bad Case
                  </button>
                  <button
                    className="btn"
                    disabled={saving || !selected.badCase || Boolean(selected.badCase.convertedEvalCaseId)}
                    onClick={convertToEvalCase}
                  >
                    {selected.badCase?.convertedEvalCaseId ? <CheckCircle2 size={16} /> : <FlaskConical size={16} />}
                    {selected.badCase?.convertedEvalCaseId ? "Eval Case Created" : "Convert to Eval Case"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </AppShell>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDecision(decision: AIDecision | null): string {
  if (!decision) return "No decision";
  return decision === "AI_COOLDOWN" ? "AI Cooldown" : decision;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
