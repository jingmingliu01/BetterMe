import { useCallback, useMemo, useState } from "react";
import { ClipboardCheck, FlaskConical, RefreshCw } from "lucide-react";
import { AppShell } from "../shared/AppShell";
import { sendMessage } from "../shared/api";
import { useAsyncState } from "../shared/useAsyncState";
import type {
  AITrack,
  AITrackMessage,
  AIDecision,
  BadCaseReview,
  BadCaseSeverity,
  BadCaseType,
  EvalCase
} from "../../shared/types";
import "../shared/styles.css";

type RecentTrack = AITrack & { messages: AITrackMessage[] };

interface ReviewState {
  tracks: RecentTrack[];
  reviews: BadCaseReview[];
  evalCases: EvalCase[];
}

const BAD_CASE_TYPES: BadCaseType[] = [
  "wrong_decision",
  "weak_challenge",
  "schema_issue",
  "tone_issue",
  "memory_miss",
  "policy_risk"
];

const DECISIONS: AIDecision[] = ["ALLOW", "DELAY", "ASK_MORE", "BLOCK"];

export function ReviewPage() {
  const load = useCallback(async (): Promise<ReviewState> => {
    const [tracks, reviews, evalCases] = await Promise.all([
      sendMessage<RecentTrack[]>({ type: "ai/recentTracks" }),
      sendMessage<BadCaseReview[]>({ type: "review/list" }),
      sendMessage<EvalCase[]>({ type: "eval/list" })
    ]);
    return { tracks, reviews, evalCases };
  }, []);
  const { data, loading, error, refresh } = useAsyncState(load);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [expectedDecision, setExpectedDecision] = useState<AIDecision>("DELAY");
  const [severity, setSeverity] = useState<BadCaseSeverity>("medium");
  const [types, setTypes] = useState<BadCaseType[]>(["weak_challenge"]);
  const [pmNote, setPmNote] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [assertion, setAssertion] = useState("");

  const selectedTrack = useMemo(
    () => data?.tracks.find((track) => track.id === selectedTrackId) ?? data?.tracks[0] ?? null,
    [data?.tracks, selectedTrackId]
  );

  async function createReview() {
    if (!selectedTrack) return;
    await sendMessage<BadCaseReview>({
      type: "review/create",
      payload: {
        trackId: selectedTrack.id,
        targetDisplay: selectedTrack.targetDisplay,
        observedDecision: selectedTrack.finalDecision ?? "ASK_MORE",
        expectedDecision,
        severity,
        types,
        pmNote: pmNote || "Observed behavior does not match the intended checkpoint policy.",
        rootCause: rootCause || "Model did not apply product rubric strongly enough.",
        proposedEvalAssertion: assertion || `For similar context, the model should return ${expectedDecision}.`
      }
    });
    setPmNote("");
    setRootCause("");
    setAssertion("");
    await refresh();
  }

  if (loading || !data) {
    return <AppShell title="AI PM Review" subtitle="Loading tracks, bad cases, and eval set..." />;
  }

  return (
    <AppShell
      title="AI PM Review Workspace"
      subtitle="Turn messy AI Check failures into labeled bad cases and reusable eval cases."
    >
      {error && <p className="badge badge-danger">{error}</p>}
      <section className="grid three-col">
        <MetricCard label="Recent Tracks" value={data.tracks.length} />
        <MetricCard label="Bad Cases" value={data.reviews.length} />
        <MetricCard label="Eval Cases" value={data.evalCases.length} />
      </section>

      <section className="grid two-col">
        <div className="panel stack">
          <div className="row space-between">
            <h2>1. Review AI Track</h2>
            <button className="btn btn-ghost" onClick={refresh}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          <select
            className="select"
            value={selectedTrack?.id ?? ""}
            onChange={(event) => setSelectedTrackId(event.target.value)}
          >
            {data.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.targetDisplay} · {track.finalDecision ?? track.status} · {new Date(track.startedAt).toLocaleString()}
              </option>
            ))}
          </select>
          {selectedTrack ? (
            <div className="stack">
              <div className="row">
                <span className="badge">Observed: {selectedTrack.finalDecision ?? selectedTrack.status}</span>
                <span className="badge">{selectedTrack.targetDisplay}</span>
              </div>
              <div className="message-list">
                {selectedTrack.messages.map((message) => (
                  <div
                    className={message.role === "user" ? "message message-user" : "message message-assistant"}
                    key={message.id}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted">No AI tracks yet. Run a demo AI Check first.</p>
          )}
        </div>

        <div className="panel stack">
          <h2>2. Label Bad Case</h2>
          <p className="muted">
            AI PM 判断 bad case 不是“我不喜欢这个回答”，而是模型行为违反了产品 rubric、用户安全边界或可验证的输出约束。
          </p>
          <div className="grid two-col">
            <label className="stack">
              <span>Expected Decision</span>
              <select
                className="select"
                value={expectedDecision}
                onChange={(event) => setExpectedDecision(event.target.value as AIDecision)}
              >
                {DECISIONS.map((decision) => (
                  <option key={decision}>{decision}</option>
                ))}
              </select>
            </label>
            <label className="stack">
              <span>Severity</span>
              <select
                className="select"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as BadCaseSeverity)}
              >
                <option>low</option>
                <option>medium</option>
                <option>high</option>
              </select>
            </label>
          </div>
          <div className="row">
            {BAD_CASE_TYPES.map((type) => (
              <label className="badge" key={type}>
                <input
                  type="checkbox"
                  checked={types.includes(type)}
                  onChange={(event) => {
                    setTypes((current) =>
                      event.target.checked ? [...current, type] : current.filter((item) => item !== type)
                    );
                  }}
                />{" "}
                {type}
              </label>
            ))}
          </div>
          <textarea
            className="textarea"
            value={pmNote}
            onChange={(event) => setPmNote(event.target.value)}
            placeholder="PM note: what went wrong from product/user perspective?"
          />
          <textarea
            className="textarea"
            value={rootCause}
            onChange={(event) => setRootCause(event.target.value)}
            placeholder="Root cause: prompt gap, missing memory, weak rubric, provider output issue..."
          />
          <textarea
            className="textarea"
            value={assertion}
            onChange={(event) => setAssertion(event.target.value)}
            placeholder="Eval assertion: what should future model behavior satisfy?"
          />
          <button className="btn btn-primary" disabled={!selectedTrack} onClick={createReview}>
            <ClipboardCheck size={16} /> Save Bad Case
          </button>
        </div>
      </section>

      <section className="grid two-col">
        <div className="panel stack">
          <h2>3. Bad Case Queue</h2>
          {data.reviews.map((review) => (
            <div className="card stack" key={review.id}>
              <div className="row">
                <span className={review.severity === "high" ? "badge badge-danger" : "badge"}>{review.severity}</span>
                <span className="badge">{review.observedDecision} → {review.expectedDecision}</span>
              </div>
              <strong>{review.targetDisplay}</strong>
              <p className="muted">{review.pmNote}</p>
              <button
                className="btn"
                onClick={async () => {
                  await sendMessage({ type: "eval/createFromBadCase", payload: { badCaseId: review.id } });
                  await refresh();
                }}
              >
                <FlaskConical size={16} /> Convert to Eval Case
              </button>
            </div>
          ))}
        </div>

        <div className="panel stack">
          <h2>4. Eval Set</h2>
          {data.evalCases.map((evalCase) => (
            <div className="card stack" key={evalCase.id}>
              <div className="row">
                <span className="badge">Expected {evalCase.expectedDecision}</span>
                {evalCase.tags.map((tag) => (
                  <span className="badge badge-warn" key={tag}>{tag}</span>
                ))}
              </div>
              <strong>{evalCase.title}</strong>
              <pre className="code">{evalCase.assertions.join("\n")}</pre>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <h3 style={{ fontSize: 34, margin: "6px 0 0" }}>{value}</h3>
    </div>
  );
}
