import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Archive,
  BookOpenText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  History,
  Plus,
  RotateCcw,
  Save,
  Search
} from "lucide-react";
import {
  AI_CHECK_BAD_CASE_ERROR_TYPES,
  AI_CHECK_CASE_SETS,
  AI_CHECK_CASE_SOURCES,
  AI_CHECK_CASE_STATUSES,
  AI_CHECK_COMMON_TAGS,
  AI_CHECK_DECISIONS,
  AI_CHECK_OUTPUT_EXAMPLE as AI_CHECK_SCHEMA_EXAMPLE_OUTPUT,
  AI_CHECK_OUTPUT_FIELD_REFERENCE as AI_CHECK_SCHEMA_FIELD_REFERENCE,
  AI_CHECK_STRICTNESS_LEVELS
} from "../../shared/ai-check-contract";
import { AppShell } from "../shared/AppShell";
import { sendMessage } from "../shared/api";
import { useAsyncState } from "../shared/useAsyncState";
import type {
  AICheckCase,
  AICheckCaseStatus,
  AIDecision,
  AIPMReviewSession,
  BadCaseErrorType,
  BadCaseReview,
  CreateEvalCaseInput,
  StrictnessLevel,
  AICheckSchemaFieldReference,
  UpdateEvalCaseInput
} from "../../shared/types";
import "../shared/styles.css";

type ReviewArea = "history" | "eval" | "schema";

interface EvalFormState {
  title: string;
  source: AICheckCase["source"];
  status: AICheckCaseStatus;
  targetDisplay: string;
  strictness: StrictnessLevel;
  userMessage: string;
  expectedDecision: AIDecision;
  tags: string;
  reviewerNote: string;
  mustAskAbout: string;
  mustNotSay: string;
  archivedReason: string;
}

interface SchemaTreeNode {
  name: string;
  path: string;
  type: string;
  required: boolean;
  nullable?: boolean;
  field?: AICheckSchemaFieldReference;
  children: SchemaTreeNode[];
}

const ERROR_TYPES: Array<{ value: BadCaseErrorType; label: string }> = [
  ...AI_CHECK_BAD_CASE_ERROR_TYPES
];

const COMMON_TAGS = AI_CHECK_COMMON_TAGS;

const EVAL_STATUSES = AI_CHECK_CASE_STATUSES;
const CASE_SETS = AI_CHECK_CASE_SETS;

export function ReviewPage() {
  const loadSessions = useCallback(() => sendMessage<AIPMReviewSession[]>({ type: "review/listSessions" }), []);
  const loadEvalCases = useCallback(() => sendMessage<AICheckCase[]>({ type: "review/listEvalCases" }), []);
  const {
    data: sessionData,
    error: sessionError,
    loading: sessionsLoading,
    refresh: refreshSessions
  } = useAsyncState(loadSessions);
  const {
    data: evalData,
    error: evalError,
    loading: evalLoading,
    refresh: refreshEvalCases
  } = useAsyncState(loadEvalCases);
  const [area, setArea] = useState<ReviewArea>("history");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expectedDecision, setExpectedDecision] = useState<AIDecision | "">("");
  const [errorTypes, setErrorTypes] = useState<BadCaseErrorType[]>([]);
  const [reviewerNote, setReviewerNote] = useState("");
  const [selectedSetId, setSelectedSetId] = useState("active");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [caseSearch, setCaseSearch] = useState("");
  const [selectedEvalCaseId, setSelectedEvalCaseId] = useState<string | null>(null);
  const [creatingEvalCase, setCreatingEvalCase] = useState(false);
  const [evalForm, setEvalForm] = useState<EvalFormState>(emptyEvalForm());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const sessions = sessionData ?? [];
  const evalCases = evalData ?? [];
  const selectedSession = useMemo(
    () => sessions.find((item) => item.session.id === selectedSessionId) ?? sessions[0] ?? null,
    [selectedSessionId, sessions]
  );
  const latestDecision = selectedSession?.decisions.at(-1) ?? null;

  const availableTags = useMemo(() => {
    const tags = new Set(COMMON_TAGS);
    for (const evalCase of evalCases) {
      for (const tag of evalCase.eval?.tags ?? []) tags.add(tag);
    }
    return [...tags].sort();
  }, [evalCases]);

  const selectedSet = CASE_SETS.find((item) => item.id === selectedSetId) ?? CASE_SETS[0];
  const filteredEvalCases = useMemo(() => {
    const query = caseSearch.trim().toLowerCase();
    return evalCases.filter((evalCase) => {
      if (!caseMatchesSet(evalCase, selectedSet)) return false;
      if (selectedTag !== "all" && !(evalCase.eval?.tags ?? []).includes(selectedTag)) return false;
      if (!query) return true;
      return [
        evalCase.title,
        evalCase.input.targetDisplay,
        evalCase.eval?.expectedOutput.decision,
        evalCase.input.strictness,
        ...(evalCase.eval?.tags ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [caseSearch, evalCases, selectedSet, selectedTag]);

  const selectedEvalCase = useMemo(() => {
    if (creatingEvalCase) return null;
    return (
      filteredEvalCases.find((item) => item.id === selectedEvalCaseId) ??
      filteredEvalCases[0] ??
      evalCases.find((item) => item.id === selectedEvalCaseId) ??
      null
    );
  }, [creatingEvalCase, evalCases, filteredEvalCases, selectedEvalCaseId]);

  useEffect(() => {
    if (!selectedSession) return;
    setSelectedSessionId(selectedSession.session.id);
    setExpectedDecision(selectedSession.badCase?.expectedDecision ?? "");
    setErrorTypes(selectedSession.badCase?.errorTypes ?? []);
    setReviewerNote(selectedSession.badCase?.reviewerNote ?? "");
  }, [selectedSession?.session.id]);

  useEffect(() => {
    if (creatingEvalCase) {
      setEvalForm(emptyEvalForm());
    } else if (selectedEvalCase) {
      setSelectedEvalCaseId(selectedEvalCase.id);
      setEvalForm(formFromEvalCase(selectedEvalCase));
    }
  }, [creatingEvalCase, selectedEvalCase?.id]);

  async function refreshAll() {
    await Promise.all([refreshSessions(), refreshEvalCases()]);
  }

  async function saveBadCase() {
    if (!selectedSession) return;
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        expectedDecision: expectedDecision || null,
        errorTypes,
        reviewerNote
      };
      const badCase = selectedSession.badCase
        ? await sendMessage<BadCaseReview>({
            type: "review/updateBadCase",
            payload: {
              id: selectedSession.badCase.id,
              ...payload
            }
          })
        : await sendMessage<BadCaseReview>({
            type: "review/createBadCase",
            payload: {
              sessionId: selectedSession.session.id,
              decisionId: latestDecision?.id ?? null,
              ...payload
            }
          });
      setStatus(`Saved bad case ${badCase.id}.`);
      await refreshSessions();
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : "Could not save bad case.");
    } finally {
      setSaving(false);
    }
  }

  async function convertToEvalCase() {
    if (!selectedSession?.badCase) return;
    setSaving(true);
    setStatus(null);
    try {
      const evalCase = await sendMessage<AICheckCase>({
        type: "review/convertBadCaseToEval",
        payload: { badCaseId: selectedSession.badCase.id }
      });
      setStatus(`Created eval case ${evalCase.id}.`);
      setArea("eval");
      setSelectedSetId("draft");
      setCreatingEvalCase(false);
      setSelectedEvalCaseId(evalCase.id);
      await refreshAll();
    } catch (convertError) {
      setStatus(convertError instanceof Error ? convertError.message : "Could not convert bad case.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEvalCase() {
    setSaving(true);
    setStatus(null);
    try {
      const base = {
        title: evalForm.title,
        status: evalForm.status,
        targetDisplay: evalForm.targetDisplay,
        strictness: evalForm.strictness,
        userMessage: evalForm.userMessage,
        expectedDecision: evalForm.expectedDecision,
        tags: splitList(evalForm.tags),
        reviewerNote: evalForm.reviewerNote,
        mustAskAbout: splitList(evalForm.mustAskAbout),
        mustNotSay: splitList(evalForm.mustNotSay)
      };
      const saved = creatingEvalCase
        ? await sendMessage<AICheckCase>({
            type: "review/createEvalCase",
            payload: {
              ...base,
              source: evalForm.source
            } satisfies CreateEvalCaseInput
          })
        : await sendMessage<AICheckCase>({
            type: "review/updateEvalCase",
            payload: {
              id: selectedEvalCase?.id ?? "",
              ...base
            } satisfies UpdateEvalCaseInput
          });
      setStatus(`Saved eval case ${saved.id}.`);
      setCreatingEvalCase(false);
      setSelectedEvalCaseId(saved.id);
      setSelectedSetId(saved.status === "regression" ? "regression" : saved.status === "draft" ? "draft" : "active");
      await refreshEvalCases();
    } catch (saveError) {
      setStatus(saveError instanceof Error ? saveError.message : "Could not save eval case.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveSelectedEvalCase() {
    if (!selectedEvalCase) return;
    setSaving(true);
    setStatus(null);
    try {
      const archived = await sendMessage<AICheckCase>({
        type: "review/archiveEvalCase",
        payload: {
          id: selectedEvalCase.id,
          archivedReason: evalForm.archivedReason
        }
      });
      setStatus(`Archived eval case ${archived.id}.`);
      setSelectedSetId("archived");
      await refreshEvalCases();
    } catch (archiveError) {
      setStatus(archiveError instanceof Error ? archiveError.message : "Could not archive eval case.");
    } finally {
      setSaving(false);
    }
  }

  if ((sessionsLoading && !sessionData) || (evalLoading && !evalData)) {
    return <AppShell title="AI PM Review" subtitle="Loading local AI quality workspace..." />;
  }

  return (
    <AppShell title="AI PM Review" subtitle="Review history, curate evaluation cases, and keep the schema contract visible.">
      {(sessionError || evalError) && <p className="badge badge-danger">{sessionError ?? evalError}</p>}
      {status && <p className="badge">{status}</p>}
      <nav className="review-area-tabs" aria-label="PM Review areas">
        <AreaButton active={area === "history"} icon={<History size={16} />} label="History Cases" onClick={() => setArea("history")} />
        <AreaButton active={area === "eval"} icon={<FlaskConical size={16} />} label="Evaluation Cases" onClick={() => setArea("eval")} />
        <AreaButton active={area === "schema"} icon={<BookOpenText size={16} />} label="Schema Reference" onClick={() => setArea("schema")} />
        <button className="icon-btn" title="Refresh workspace" onClick={() => void refreshAll()}>
          <RotateCcw size={16} />
        </button>
      </nav>

      {area === "history" && (
        <HistoryCases
          errorTypes={errorTypes}
          expectedDecision={expectedDecision}
          latestDecision={latestDecision?.decision ?? selectedSession?.session.finalDecision ?? null}
          reviewerNote={reviewerNote}
          saving={saving}
          selected={selectedSession}
          sessions={sessions}
          setErrorTypes={setErrorTypes}
          setExpectedDecision={setExpectedDecision}
          setReviewerNote={setReviewerNote}
          setSelectedSessionId={setSelectedSessionId}
          onConvert={convertToEvalCase}
          onSave={saveBadCase}
        />
      )}

      {area === "eval" && (
        <section className="eval-workspace">
          <aside className="panel eval-sidebar stack">
            <div className="section-heading">
              <span className="section-label">Case sets</span>
              <h2>Risk filters</h2>
            </div>
            <div className="case-set-list">
              {CASE_SETS.map((caseSet) => (
                <button
                  className={caseSet.id === selectedSetId ? "case-set-item case-set-item-selected" : "case-set-item"}
                  key={caseSet.id}
                  onClick={() => setSelectedSetId(caseSet.id)}
                >
                  <strong>{caseSet.name}</strong>
                  <span>{caseSet.description}</span>
                  <small>{countCasesForSet(evalCases, caseSet)} cases</small>
                </button>
              ))}
            </div>

            <label className="stack compact-stack">
              <span>Tag filter</span>
              <select className="select" value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}>
                <option value="all">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {formatTag(tag)}
                  </option>
                ))}
              </select>
            </label>
          </aside>

          <section className="panel eval-list-panel stack">
            <div className="row space-between">
              <div className="section-heading">
                <span className="section-label">Evaluation Cases</span>
                <h2>{selectedSet.name}</h2>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setArea("eval");
                  setCreatingEvalCase(true);
                  setSelectedEvalCaseId(null);
                }}
              >
                <Plus size={16} /> Add Case
              </button>
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                value={caseSearch}
                onChange={(event) => setCaseSearch(event.target.value)}
                placeholder="Search title, target, decision, or tag"
              />
            </label>
            <div className="eval-case-list" aria-label="Evaluation case list">
              {filteredEvalCases.length === 0 ? (
                <p className="muted">No evaluation cases match this filter.</p>
              ) : (
                filteredEvalCases.map((evalCase) => (
                  <button
                    className={
                      evalCase.id === selectedEvalCase?.id && !creatingEvalCase
                        ? "eval-case-item eval-case-item-selected"
                        : "eval-case-item"
                    }
                    key={evalCase.id}
                    onClick={() => {
                      setCreatingEvalCase(false);
                      setSelectedEvalCaseId(evalCase.id);
                    }}
                  >
                    <div className="row space-between">
                      <strong>{evalCase.title}</strong>
                      <span className={`status-pill status-pill-${evalCase.status}`}>{formatStatus(evalCase.status)}</span>
                    </div>
                    <span>{evalCase.input.targetDisplay}</span>
                    <small>
                      {formatDecision(evalCase.eval?.expectedOutput.decision ?? null)} · {evalCase.input.strictness}
                    </small>
                    <TagList tags={evalCase.eval?.tags ?? []} />
                  </button>
                ))
              )}
            </div>
          </section>

          <EvalCaseDetail
            creating={creatingEvalCase}
            evalCase={selectedEvalCase}
            form={evalForm}
            saving={saving}
            setForm={setEvalForm}
            onArchive={archiveSelectedEvalCase}
            onCancelCreate={() => {
              setCreatingEvalCase(false);
              setEvalForm(selectedEvalCase ? formFromEvalCase(selectedEvalCase) : emptyEvalForm());
            }}
            onSave={saveEvalCase}
          />
        </section>
      )}

      {area === "schema" && <SchemaReference />}
    </AppShell>
  );
}

function HistoryCases({
  errorTypes,
  expectedDecision,
  latestDecision,
  reviewerNote,
  saving,
  selected,
  sessions,
  setErrorTypes,
  setExpectedDecision,
  setReviewerNote,
  setSelectedSessionId,
  onConvert,
  onSave
}: {
  errorTypes: BadCaseErrorType[];
  expectedDecision: AIDecision | "";
  latestDecision: AIDecision | null;
  reviewerNote: string;
  saving: boolean;
  selected: AIPMReviewSession | null;
  sessions: AIPMReviewSession[];
  setErrorTypes: (value: BadCaseErrorType[] | ((current: BadCaseErrorType[]) => BadCaseErrorType[])) => void;
  setExpectedDecision: (value: AIDecision | "") => void;
  setReviewerNote: (value: string) => void;
  setSelectedSessionId: (value: string) => void;
  onConvert: () => void;
  onSave: () => void;
}) {
  return (
    <section className="review-layout">
      <aside className="panel review-session-list stack">
        <div className="section-heading">
          <span className="section-label">History Cases</span>
          <h2>Recent AI Checks</h2>
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
                <StatusItem label="Actual" value={formatDecision(latestDecision)} />
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

            {selected.decisions.at(-1) && (
              <details className="review-json">
                <summary>Decision JSON</summary>
                <pre className="code">{JSON.stringify(selected.decisions.at(-1), null, 2)}</pre>
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
                  {AI_CHECK_DECISIONS.map((decision) => (
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
                          event.target.checked ? [...current, item.value] : current.filter((value) => value !== item.value)
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
                <button className="btn btn-primary" disabled={saving || errorTypes.length === 0} onClick={onSave}>
                  <Save size={16} /> Save Bad Case
                </button>
                <button
                  className="btn"
                  disabled={saving || !selected.badCase || Boolean(selected.badCase.convertedEvalCaseId)}
                  onClick={onConvert}
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
  );
}

function EvalCaseDetail({
  creating,
  evalCase,
  form,
  saving,
  setForm,
  onArchive,
  onCancelCreate,
  onSave
}: {
  creating: boolean;
  evalCase: AICheckCase | null;
  form: EvalFormState;
  saving: boolean;
  setForm: (value: EvalFormState | ((current: EvalFormState) => EvalFormState)) => void;
  onArchive: () => void;
  onCancelCreate: () => void;
  onSave: () => void;
}) {
  if (!creating && !evalCase) {
    return (
      <section className="panel eval-detail-panel stack">
        <div className="empty-state">
          <ClipboardList size={28} />
          <strong>Select an evaluation case</strong>
          <span>The detail editor stays open as the third column.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel eval-detail-panel stack">
      <div className="row space-between">
        <div className="section-heading">
          <span className="section-label">{creating ? "Create Evaluation Case" : "Selected Case"}</span>
          <h2>{creating ? "New authored case" : evalCase?.title}</h2>
        </div>
        {creating && (
          <button className="btn" onClick={onCancelCreate}>
            Cancel
          </button>
        )}
      </div>

      <div className="eval-form-grid">
        <label className="stack compact-stack">
          <span>Title</span>
          <input
            className="input"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Over-allow vague YouTube reason in strict mode"
          />
        </label>
        <label className="stack compact-stack">
          <span>Status</span>
          <select
            className="select"
            value={form.status}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AICheckCaseStatus }))}
          >
            {EVAL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="stack compact-stack">
          <span>Source</span>
          <select
            className="select"
            value={form.source}
            disabled={!creating}
            onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as AICheckCase["source"] }))}
          >
            {AI_CHECK_CASE_SOURCES.map((source) => (
              <option key={source} value={source}>
                {formatTag(source)}
              </option>
            ))}
          </select>
        </label>
        <label className="stack compact-stack">
          <span>Target display</span>
          <input
            className="input"
            value={form.targetDisplay}
            onChange={(event) => setForm((current) => ({ ...current, targetDisplay: event.target.value }))}
            placeholder="youtube.com"
          />
        </label>
        <label className="stack compact-stack">
          <span>Strictness</span>
          <select
            className="select"
            value={form.strictness}
            onChange={(event) => setForm((current) => ({ ...current, strictness: event.target.value as StrictnessLevel }))}
          >
            {AI_CHECK_STRICTNESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label className="stack compact-stack">
          <span>Expected decision</span>
          <select
            className="select"
            value={form.expectedDecision}
            onChange={(event) => setForm((current) => ({ ...current, expectedDecision: event.target.value as AIDecision }))}
          >
            {AI_CHECK_DECISIONS.map((decision) => (
              <option key={decision} value={decision}>
                {formatDecision(decision)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="stack compact-stack">
        <span>User message</span>
        <textarea
          className="textarea"
          value={form.userMessage}
          onChange={(event) => setForm((current) => ({ ...current, userMessage: event.target.value }))}
          placeholder="I just want to watch one quick video."
        />
      </label>
      <label className="stack compact-stack">
        <span>Tags</span>
        <input
          className="input"
          value={form.tags}
          onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
          placeholder="over_allow, video, strictness"
        />
      </label>
      <label className="stack compact-stack">
        <span>Reviewer note</span>
        <textarea
          className="textarea"
          value={form.reviewerNote}
          onChange={(event) => setForm((current) => ({ ...current, reviewerNote: event.target.value }))}
          placeholder="Model should ask for a time limit and exit plan instead of allowing."
        />
      </label>
      <div className="eval-form-grid">
        <label className="stack compact-stack">
          <span>Must ask about</span>
          <input
            className="input"
            value={form.mustAskAbout}
            onChange={(event) => setForm((current) => ({ ...current, mustAskAbout: event.target.value }))}
            placeholder="time limit, exit plan"
          />
        </label>
        <label className="stack compact-stack">
          <span>Must not say</span>
          <input
            className="input"
            value={form.mustNotSay}
            onChange={(event) => setForm((current) => ({ ...current, mustNotSay: event.target.value }))}
            placeholder="You are weak"
          />
        </label>
      </div>

      {!creating && evalCase?.output && (
        <details className="review-json">
          <summary>Provider output</summary>
          <pre className="code">{JSON.stringify(evalCase.output, null, 2)}</pre>
        </details>
      )}

      {!creating && (
        <label className="stack compact-stack">
          <span>Archived reason</span>
          <input
            className="input"
            value={form.archivedReason}
            onChange={(event) => setForm((current) => ({ ...current, archivedReason: event.target.value }))}
            placeholder="Covered by a broader regression case."
          />
        </label>
      )}

      <div className="row">
        <button
          className="btn btn-primary"
          disabled={saving || !form.title.trim() || !form.targetDisplay.trim() || !form.userMessage.trim()}
          onClick={onSave}
        >
          <Save size={16} /> {creating ? "Create Case" : "Save Case"}
        </button>
        {!creating && evalCase?.status !== "archived" && (
          <button className="btn btn-danger" disabled={saving} onClick={onArchive}>
            <Archive size={16} /> Archive
          </button>
        )}
      </div>
    </section>
  );
}

function SchemaReference() {
  const schemaTree = useMemo(() => buildSchemaTree(AI_CHECK_SCHEMA_FIELD_REFERENCE), []);

  return (
    <section className="schema-reference stack">
      <div className="panel stack">
        <div className="section-heading">
          <span className="section-label">Structured output contract</span>
          <h2>Current AI Check schema shape</h2>
        </div>
        <p className="muted">
          This reference is generated from a shared descriptor so PM Review can stay aligned with parser validation, prompt
          contract, and eval expectations.
        </p>
      </div>
      <div className="schema-workspace">
        <section className="panel schema-tree-panel stack">
          <div className="section-heading">
            <span className="section-label">Schema Shape</span>
            <h2>JSON output</h2>
          </div>
          <div className="schema-root-row">
            <span className="schema-brace">{"{"}</span>
            <span className="muted">root object</span>
            <span className="schema-brace">{"}"}</span>
          </div>
          <div className="schema-tree">
            {schemaTree.map((node) => (
              <SchemaTreeItem key={node.path} node={node} depth={0} />
            ))}
          </div>
        </section>

        <section className="panel schema-example-panel stack">
          <div className="section-heading">
            <span className="section-label">Example Output</span>
            <h2>ASK_MORE case</h2>
          </div>
          <p className="muted">A complete model response for a vague YouTube request that needs a time limit and exit plan.</p>
          <pre className="code schema-example-code">{JSON.stringify(AI_CHECK_SCHEMA_EXAMPLE_OUTPUT, null, 2)}</pre>
        </section>
      </div>
    </section>
  );
}

function SchemaTreeItem({ depth, node }: { depth: number; node: SchemaTreeNode }) {
  const defaultOpen = node.children.length > 0;
  const field = node.field;
  const detailsId = `schema-field-${node.path.replaceAll(".", "-")}`;

  return (
    <details className="schema-tree-item" open={defaultOpen}>
      <summary className="schema-tree-summary" aria-controls={detailsId}>
        <span className="schema-tree-indent" style={{ "--schema-depth": depth } as CSSProperties} />
        <span className="schema-disclosure" aria-hidden="true">
          <ChevronRight className="schema-chevron-closed" size={14} />
          <ChevronDown className="schema-chevron-open" size={14} />
        </span>
        <span className="schema-key">{node.name}</span>
        <span className={node.required ? "status-pill status-pill-regression" : "status-pill status-pill-ready"}>
          {node.required ? "Required" : "Optional"}
        </span>
        {node.nullable && <span className="status-pill status-pill-archived">Nullable</span>}
        <span className="schema-type">{node.type}</span>
        <span className="schema-summary-text">{field?.meaning ?? "Nested object in the AI Check structured output."}</span>
      </summary>

      <div className="schema-tree-body" id={detailsId}>
        {field && (
          <dl className="schema-field-details">
            <div>
              <dt>Why necessary</dt>
              <dd>{field.whyNecessary}</dd>
            </div>
            <div>
              <dt>Product impact</dt>
              <dd>{field.productImpact}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>{field.validation}</dd>
            </div>
            <div>
              <dt>Common mistakes</dt>
              <dd>{field.commonMistakes}</dd>
            </div>
            {field.example !== undefined && (
              <div>
                <dt>Example</dt>
                <dd>
                  <code>{JSON.stringify(field.example)}</code>
                </dd>
              </div>
            )}
          </dl>
        )}
        {node.children.length > 0 && (
          <div className="schema-tree-children">
            {node.children.map((child) => (
              <SchemaTreeItem depth={depth + 1} key={child.path} node={child} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function buildSchemaTree(fields: AICheckSchemaFieldReference[]): SchemaTreeNode[] {
  const roots: SchemaTreeNode[] = [];
  const nodes = new Map<string, SchemaTreeNode>();

  for (const field of fields) {
    const parts = field.path.split(".");
    let parentChildren = roots;
    let currentPath = "";

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      currentPath = currentPath ? `${currentPath}.${name}` : name;
      const isLeaf = index === parts.length - 1;
      let node = nodes.get(currentPath);

      if (!node) {
        node = {
          name,
          path: currentPath,
          type: isLeaf ? field.type : "object",
          required: true,
          nullable: false,
          children: []
        };
        nodes.set(currentPath, node);
        parentChildren.push(node);
      }

      if (isLeaf) {
        node.field = field;
        node.type = field.type;
        node.required = field.required;
        node.nullable = field.nullable ?? field.type.includes("null");
      }

      parentChildren = node.children;
    }
  }

  return roots;
}

function AreaButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "review-area-tab review-area-tab-active" : "review-area-tab"} onClick={onClick}>
      {icon}
      {label}
    </button>
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

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="muted">No tags</span>;
  return (
    <div className="tag-list">
      {tags.slice(0, 4).map((tag) => (
        <span key={tag}>{formatTag(tag)}</span>
      ))}
      {tags.length > 4 && <span>+{tags.length - 4}</span>}
    </div>
  );
}

function emptyEvalForm(): EvalFormState {
  return {
    title: "",
    source: "authored_eval",
    status: "draft",
    targetDisplay: "",
    strictness: "balanced",
    userMessage: "",
    expectedDecision: "ASK_MORE",
    tags: "",
    reviewerNote: "",
    mustAskAbout: "",
    mustNotSay: "",
    archivedReason: ""
  };
}

function formFromEvalCase(evalCase: AICheckCase): EvalFormState {
  const firstUserMessage = evalCase.input.messages.find((message) => message.role === "user")?.content ?? "";
  return {
    title: evalCase.title,
    source: evalCase.source,
    status: evalCase.status,
    targetDisplay: evalCase.input.targetDisplay,
    strictness: evalCase.input.strictness,
    userMessage: firstUserMessage,
    expectedDecision: evalCase.eval?.expectedOutput.decision ?? "ASK_MORE",
    tags: joinList(evalCase.eval?.tags),
    reviewerNote: evalCase.eval?.reviewerNote ?? "",
    mustAskAbout: joinList(evalCase.eval?.mustAskAbout),
    mustNotSay: joinList(evalCase.eval?.mustNotSay),
    archivedReason: evalCase.archivedReason ?? ""
  };
}

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function joinList(values: string[] | undefined): string {
  return values?.join(", ") ?? "";
}

function caseMatchesSet(evalCase: AICheckCase, caseSet: (typeof CASE_SETS)[number]): boolean {
  if (!caseSet.includeArchived && evalCase.status === "archived") return false;
  if (!caseSet.statuses.includes(evalCase.status)) return false;
  if (caseSet.tags?.length) {
    const tags = new Set(evalCase.eval?.tags ?? []);
    return caseSet.tags.some((tag) => tags.has(tag));
  }
  return true;
}

function countCasesForSet(evalCases: AICheckCase[], caseSet: (typeof CASE_SETS)[number]): number {
  return evalCases.filter((evalCase) => caseMatchesSet(evalCase, caseSet)).length;
}

function formatDecision(decision: AIDecision | null): string {
  if (!decision) return "No decision";
  return decision === "AI_COOLDOWN" ? "AI Cooldown" : decision.replace("_", " ");
}

function formatStatus(status: AICheckCaseStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatTag(tag: string): string {
  return tag.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
