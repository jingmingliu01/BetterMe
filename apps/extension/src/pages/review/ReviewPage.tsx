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
  AI_CHECK_CONTRACT,
  AI_CHECK_BAD_CASE_ERROR_TYPES,
  AI_CHECK_CASE_SETS,
  AI_CHECK_CASE_SOURCES,
  AI_CHECK_CASE_STATUSES,
  AI_CHECK_COMMON_TAGS,
  AI_CHECK_DECISIONS,
  AI_CHECK_EVALUATION_EXAMPLE,
  AI_CHECK_EVALUATION_FIELD_REFERENCE,
  AI_CHECK_INPUT_FIELD_REFERENCE,
  AI_CHECK_OUTPUT_EXAMPLE,
  AI_CHECK_OUTPUT_FIELD_REFERENCE,
  AI_CHECK_OUTPUT_PROMPT_SCHEMA,
  AI_CHECK_OUTPUT_SCHEMA_SUMMARY,
  AI_CHECK_STRICTNESS_LEVELS
} from "../../shared/ai-check-contract";
import {
  buildRoundSnapshot,
  buildTrustedRoundContextParts,
  buildTrustedTurnContextParts
} from "../../ai/context-builder";
import { buildStaticContractPromptParts } from "../../ai/prompt";
import type { PromptPart } from "../../ai/prompt";
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
type SchemaManualTab = "messages" | "output" | "evaluation" | "compare";

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

interface SchemaManualSection {
  title: string;
  summary: string;
  fields: AICheckSchemaFieldReference[];
  example: unknown;
  schemaSummary?: string;
  promptSchema?: unknown;
}

interface CompareRow {
  path: string;
  input: string;
  output: string;
  evaluation: string;
  relation: string;
}

type ProviderMessageFocus = "system" | "round" | "conversation" | "turn";

interface ProviderMessagePreviewSection {
  id: ProviderMessageFocus;
  label: string;
  token: string;
  role: string;
  path: string;
  tags: string[];
  parts?: PromptPart[];
  previewText?: string;
}

interface PromptPreviewBlock {
  tagName?: string;
  boundaryText?: string;
  body: string;
  dynamic: boolean;
  sourceTitle?: string;
}

interface SchemaSelection {
  node: SchemaTreeNode;
  field?: AICheckSchemaFieldReference;
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
  const [activeTab, setActiveTab] = useState<SchemaManualTab>("messages");

  return (
    <section className="schema-reference stack">
      <div className="panel stack">
        <div className="section-heading">
          <span className="section-label">AI Check Contract Manual</span>
        </div>
        <p className="muted">
          This manual is generated from shared contract references so PM Review stays aligned with runtime prompt building,
          parser validation, and eval expectations.
        </p>
        <div className="contract-version-grid">
          <VersionChip label="Prompt" value={AI_CHECK_CONTRACT.promptVersion} source="AI_CHECK_CONTRACT.promptVersion" />
          <VersionChip label="Schema" value={AI_CHECK_CONTRACT.schemaVersion} source="AI_CHECK_CONTRACT.schemaVersion" />
          <VersionChip label="Rubric" value={AI_CHECK_CONTRACT.rubricVersion} source="AI_CHECK_CONTRACT.rubricVersion" />
          <VersionChip
            label="Session"
            value={`${AI_CHECK_CONTRACT.sessionPolicy.maxAssistantTurns} turns / ${AI_CHECK_CONTRACT.sessionPolicy.maxSessionSeconds}s`}
            source="AI_CHECK_CONTRACT.sessionPolicy"
          />
        </div>
      </div>

      <div className="schema-manual-tabs" role="tablist" aria-label="Schema reference views">
        {(["messages", "output", "evaluation", "compare"] as SchemaManualTab[]).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "schema-manual-tab schema-manual-tab-active" : "schema-manual-tab"}
            onClick={() => setActiveTab(tab)}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {formatSchemaManualTab(tab)}
          </button>
        ))}
      </div>

      {activeTab === "messages" && <ProviderMessagesReference focus="system" />}
      {activeTab === "output" && (
        <SchemaSectionReference
          kind="output"
          section={{
            title: AI_CHECK_CONTRACT.sections.output.title,
            summary: AI_CHECK_CONTRACT.sections.output.summary,
            fields: AI_CHECK_OUTPUT_FIELD_REFERENCE,
            example: AI_CHECK_OUTPUT_EXAMPLE,
            promptSchema: AI_CHECK_OUTPUT_PROMPT_SCHEMA,
            schemaSummary: AI_CHECK_OUTPUT_SCHEMA_SUMMARY
          }}
        />
      )}
      {activeTab === "evaluation" && (
        <SchemaSectionReference
          kind="evaluation"
          section={{
            title: AI_CHECK_CONTRACT.sections.evaluation.title,
            summary: AI_CHECK_CONTRACT.sections.evaluation.summary,
            fields: AI_CHECK_EVALUATION_FIELD_REFERENCE,
            example: AI_CHECK_EVALUATION_EXAMPLE
          }}
        />
      )}
      {activeTab === "compare" && <SchemaCompareReference />}
    </section>
  );
}

function VersionChip({ label, source, value }: { label: string; source: string; value: string }) {
  return (
    <div className="contract-version-chip">
      <span>{label}</span>
      <strong>{value}</strong>
      <code>{source}</code>
    </div>
  );
}

function SchemaSectionReference({ kind, section }: { kind: "input" | "output" | "evaluation"; section: SchemaManualSection }) {
  const firstPath = useMemo(() => findFirstExampleFieldPath(section.example, section.fields) ?? section.fields[0]?.path ?? "", [section]);
  const [selectedPath, setSelectedPath] = useState(firstPath);
  const selectedField = useMemo(
    () => section.fields.find((field) => field.path === selectedPath) ?? section.fields[0],
    [section.fields, selectedPath]
  );

  useEffect(() => {
    setSelectedPath(firstPath);
  }, [firstPath]);

  return (
    <div className="provider-message-workspace">
      <section className="panel provider-message-tree-panel">
        <SchemaExampleViewer
          example={section.example}
          fields={section.fields}
          label={section.title}
          selectedPath={selectedField?.path ?? selectedPath}
          onSelect={setSelectedPath}
        />
      </section>

      <section className="panel provider-preview-panel schema-selection-panel stack">
        {selectedField && <SchemaSelectionPreview kind={kind} section={section} field={selectedField} />}
      </section>
    </div>
  );
}

function InputComposition() {
  const items = [
    "generated System Prompt",
    "current target",
    "relevant pattern memory",
    "user-visible conversation messages"
  ];

  return (
    <div className="input-composition">
      <strong>Provider request composition</strong>
      <p className="muted">The System Prompt is one component of the provider request/model input.</p>
      <div>
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function EvaluationDefinition() {
  return (
    <div className="input-composition">
      <strong>Evaluation relationship</strong>
      <p className="muted">
        Evaluation Case = input + optional captured output + eval assertions. Regression Case = Evaluation Case with
        status regression and no archivedAt.
      </p>
    </div>
  );
}

function SchemaExampleViewer({
  example,
  fields,
  label,
  onSelect,
  selectedPath
}: {
  example: unknown;
  fields: AICheckSchemaFieldReference[];
  label: string;
  onSelect: (path: string) => void;
  selectedPath: string;
}) {
  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.path, field])), [fields]);

  return (
    <div className="provider-message-tree schema-example-viewer" aria-label={`${label} example`}>
      <div className="provider-code-line">
        <span className="provider-syntax-key">{label}</span>
        <span> example</span>
      </div>
      <SchemaExampleValue
        fieldMap={fieldMap}
        indent={0}
        onSelect={onSelect}
        path=""
        selectedPath={selectedPath}
        value={example}
        wrapped
      />
    </div>
  );
}

function SchemaExampleValue({
  fieldMap,
  indent,
  onSelect,
  path,
  selectedPath,
  value,
  wrapped = true
}: {
  fieldMap: Map<string, AICheckSchemaFieldReference>;
  indent: number;
  onSelect: (path: string) => void;
  path: string;
  selectedPath: string;
  value: unknown;
  wrapped?: boolean;
}) {
  if (Array.isArray(value)) {
    return (
      <>
        {wrapped && <SchemaExampleLine indent={indent} text="[" />}
        {value.map((item, index) => (
          <SchemaExampleValue
            fieldMap={fieldMap}
            indent={wrapped ? indent + 1 : indent}
            key={`${path}-${index}`}
            onSelect={onSelect}
            path={`${path}.${index}`}
            selectedPath={selectedPath}
            value={item}
          />
        ))}
        {wrapped && <SchemaExampleLine indent={indent} text="]" />}
      </>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
  return (
      <>
        {wrapped && <SchemaExampleLine indent={indent} text="{" />}
        {entries.map(([key, childValue], index) => {
          const childPath = path ? `${path}.${key}` : key;
          const field = fieldMap.get(childPath);
          const isComplex = childValue !== null && typeof childValue === "object";
          const suffix = index < entries.length - 1 ? "," : "";

          return (
            <div key={childPath}>
              {isComplex ? (
                <>
                  <SchemaExampleLine
                    field={field}
                    indent={indent + 1}
                    onSelect={onSelect}
                    path={childPath}
                    selected={selectedPath === childPath}
                    text={`"${key}": ${Array.isArray(childValue) ? "[" : "{"}`}
                  />
                  <SchemaExampleValue
                    fieldMap={fieldMap}
                    indent={indent + 2}
                    onSelect={onSelect}
                    path={childPath}
                    selectedPath={selectedPath}
                    value={childValue}
                    wrapped={false}
                  />
                  <SchemaExampleLine indent={indent + 1} text={`${Array.isArray(childValue) ? "]" : "}"}${suffix}`} />
                </>
              ) : (
                <SchemaExampleLine
                  field={field}
                  indent={indent + 1}
                  onSelect={onSelect}
                  path={childPath}
                  selected={selectedPath === childPath}
                  text={`"${key}": ${formatExampleScalar(childValue)}${suffix}`}
                />
              )}
            </div>
          );
        })}
        {wrapped && <SchemaExampleLine indent={indent} text="}" />}
      </>
    );
  }

  return <SchemaExampleLine indent={indent} text={formatExampleScalar(value)} />;
}

function SchemaExampleLine({
  field,
  indent,
  onSelect,
  path,
  selected,
  text
}: {
  field?: AICheckSchemaFieldReference;
  indent: number;
  onSelect?: (path: string) => void;
  path?: string;
  selected?: boolean;
  text: string;
}) {
  const content = (
    <>
      <span className="schema-example-indent" style={{ "--schema-example-depth": indent } as CSSProperties} />
      <span>{text}</span>
    </>
  );

  if (!field || !path || !onSelect) {
    return <span className="provider-code-line schema-example-code-line">{content}</span>;
  }

  return (
    <button
      aria-pressed={selected}
      className={selected ? "schema-example-line-action provider-message-block-active" : "schema-example-line-action"}
      onClick={() => onSelect(path)}
      onMouseDown={(event) => event.preventDefault()}
      title={field.meaning}
      type="button"
    >
      {content}
    </button>
  );
}

function SchemaSelectionPreview({
  field,
  kind,
  section
}: {
  field: AICheckSchemaFieldReference;
  kind: "input" | "output" | "evaluation";
  section: SchemaManualSection;
}) {
  return (
    <div className="provider-preview-content">
      <div className="section-heading">
        <span className="section-label">Selected Field</span>
        <h2>{field.path.split(".").at(-1) ?? field.path}</h2>
      </div>
      <div className="provider-preview-meta" aria-label="Selected schema field metadata">
        <span>{field.path}</span>
        <span>{field.type}</span>
        <span>{field.required ? "required" : "optional"}</span>
        {field.nullable && <span>nullable</span>}
      </div>

      <div className="provider-preview-sections schema-field-preview-sections">
        <PromptPreviewBlockView block={{ body: field.meaning, dynamic: false, tagName: "meaning" }} />
        <PromptPreviewBlockView block={{ body: field.whyNecessary, dynamic: false, tagName: "why_necessary" }} />
        <PromptPreviewBlockView block={{ body: field.productImpact, dynamic: false, tagName: "product_impact" }} />
        <PromptPreviewBlockView block={{ body: field.validation, dynamic: false, tagName: "validation" }} />
        <PromptPreviewBlockView block={{ body: field.commonMistakes, dynamic: false, tagName: "common_mistakes" }} />
        {field.example !== undefined && (
          <PromptPreviewBlockView
            block={{ body: JSON.stringify(field.example, null, 2), dynamic: true, tagName: "example_value" }}
          />
        )}
      </div>

      {kind === "output" && (
        <div className="schema-guidance stack">
          <StatusItem label="Schema summary" value={section.schemaSummary ?? ""} />
          <details>
            <summary>Prompt-facing schema</summary>
            <pre className="code schema-example-code">{JSON.stringify(section.promptSchema, null, 2)}</pre>
          </details>
        </div>
      )}

      {kind === "evaluation" && (
        <div className="schema-guidance stack">
          <StatusItem label="Evaluation Case" value="input + optional captured output + eval assertions" />
          <StatusItem label="Regression Case" value="status = regression and archivedAt is empty" />
        </div>
      )}
    </div>
  );
}

function ProviderMessagesReference({ focus }: { focus: ProviderMessageFocus }) {
  const sections = useMemo(() => buildProviderMessagePreviewSections(), []);
  const [selectedSectionId, setSelectedSectionId] = useState<ProviderMessageFocus>(focus);
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const selectSection = useCallback((sectionId: ProviderMessageFocus) => {
    const scrollY = window.scrollY;
    setSelectedSectionId(sectionId);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY });
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
    });
  }, []);

  useEffect(() => {
    setSelectedSectionId(focus);
  }, [focus]);

  return (
    <div className="provider-message-workspace">
      <section className="panel provider-message-tree-panel">
        <ProviderMessagesTree
          sections={sections}
          selectedSectionId={selectedSection.id}
          onSelect={selectSection}
        />
      </section>

      <section className="panel provider-preview-panel">
        <ProviderMessagePreview section={selectedSection} />
      </section>
    </div>
  );
}

function ProviderMessagesTree({
  onSelect,
  sections,
  selectedSectionId
}: {
  onSelect: (section: ProviderMessageFocus) => void;
  sections: ProviderMessagePreviewSection[];
  selectedSectionId: ProviderMessageFocus;
}) {
  return (
    <div className="provider-message-tree" aria-label="Provider message array">
      <div className="provider-code-line">
        <span className="provider-syntax-key">messages</span>
        <span>: [</span>
      </div>
      <ProviderMessageObject
        index={0}
        role="system"
        section={sections.find((item) => item.id === "system") ?? sections[0]}
        selected={selectedSectionId === "system"}
        onSelect={onSelect}
      />
      <ProviderMessageObject
        index={1}
        role="user"
        section={sections.find((item) => item.id === "round") ?? sections[1]}
        selected={selectedSectionId === "round"}
        onSelect={onSelect}
      />
      <ProviderConversationSpread
        section={sections.find((item) => item.id === "conversation") ?? sections[2]}
        selected={selectedSectionId === "conversation"}
        onSelect={onSelect}
      />
      <ProviderMessageObject
        index={3}
        role="user"
        section={sections.find((item) => item.id === "turn") ?? sections[3]}
        selected={selectedSectionId === "turn"}
        onSelect={onSelect}
      />
      <div className="provider-code-line">]</div>
    </div>
  );
}

function ProviderMessageObject({
  index,
  onSelect,
  role,
  section,
  selected
}: {
  index: number;
  onSelect: (section: ProviderMessageFocus) => void;
  role: "system" | "user";
  section: ProviderMessagePreviewSection;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? "provider-message-block provider-message-block-active" : "provider-message-block"}
      onClick={() => onSelect(section.id)}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <span className="provider-code-line provider-code-muted">{"  "}{`// messages[${index}]`}</span>
      <span className="provider-code-line">{"  {"}</span>
      <span className="provider-code-line">
        {"    "}
        <span className="provider-syntax-key">role</span>
        <span>: </span>
        <span className="provider-syntax-string">"{role}"</span>
        <span>,</span>
      </span>
      <span className="provider-code-line">
        {"    "}
        <span className="provider-syntax-key">content</span>
        <span>: </span>
        <span className="provider-reference-token">{section.token}</span>
      </span>
      <span className="provider-code-line">{"  },"}</span>
    </button>
  );
}

function ProviderConversationSpread({
  onSelect,
  section,
  selected
}: {
  onSelect: (section: ProviderMessageFocus) => void;
  section: ProviderMessagePreviewSection;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={selected ? "provider-message-spread provider-message-block-active" : "provider-message-spread"}
      onClick={() => onSelect(section.id)}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <span className="provider-code-line">
        {"  "}
        <span className="provider-reference-token">{section.token}</span>
        <span>,</span>
      </span>
    </button>
  );
}

function ProviderMessagePreview({ section }: { section: ProviderMessagePreviewSection }) {
  return (
    <div className="provider-preview-content">
      <div className="provider-preview-meta" aria-label="Selected provider message metadata">
        <span>{section.path}</span>
        <span>role: {section.role}</span>
        {section.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      {section.parts ? (
        <PromptPartsPreview parts={section.parts} />
      ) : (
        <pre className="code provider-preview-code">{section.previewText}</pre>
      )}
    </div>
  );
}

function PromptPartsPreview({ parts }: { parts: PromptPart[] }) {
  const blocks = parts.map((part, index) => buildPromptPreviewBlock(part, index));

  return (
    <div className="provider-preview-sections">
      {blocks.map((block, index) => (
        <PromptPreviewBlockView block={block} key={`${block.tagName ?? block.body}-${index}`} />
      ))}
    </div>
  );
}

function PromptPreviewBlockView({ block }: { block: PromptPreviewBlock }) {
  const className = block.dynamic
    ? "provider-preview-section provider-preview-section-dynamic"
    : "provider-preview-section";

  return (
    <section className={className} title={block.sourceTitle}>
      {block.tagName ? (
        <div className="provider-preview-section-tag">
          <span>{block.boundaryText ?? `<${block.tagName}>`}</span>
        </div>
      ) : null}
      {block.body ? <pre className="provider-preview-section-body">{block.body}</pre> : null}
      {block.tagName && block.body ? (
        <div className="provider-preview-section-tag provider-preview-section-close">
          <span>{`</${block.tagName}>`}</span>
        </div>
      ) : null}
    </section>
  );
}

function buildPromptPreviewBlock(part: PromptPart, index: number): PromptPreviewBlock {
  const text = part.text.trim();
  const wrapperMatch = text.match(/^<([a-zA-Z0-9_:-]+)>\n([\s\S]*)\n<\/\1>$/);
  const boundaryMatch = text.match(/^<\/?([a-zA-Z0-9_:-]+)>$/);

  return {
    tagName: wrapperMatch?.[1] ?? boundaryMatch?.[1],
    boundaryText: boundaryMatch ? text : undefined,
    body: wrapperMatch?.[2] ?? (boundaryMatch ? "" : part.text),
    dynamic: Boolean(part.dynamic),
    sourceTitle: (part.sourcePaths ?? [`prompt part ${index + 1}`]).join("\n")
  };
}

function SchemaCompareReference() {
  const rows = useMemo(() => buildCompareRows(), []);

  return (
    <section className="panel stack">
      <div className="section-heading">
        <span className="section-label">Contract Diff</span>
        <h2>Input vs Output vs Evaluation</h2>
      </div>
      <p className="muted">
        This table is generated from contract section field paths so reviewers can see which fields belong to each part of the
        AI Check loop.
      </p>
      <div className="compare-table-wrap">
        <table className="table compare-table">
          <thead>
            <tr>
              <th>Path</th>
              <th>Input</th>
              <th>Output</th>
              <th>Evaluation</th>
              <th>Relation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.path}>
                <td>
                  <code>{row.path}</code>
                </td>
                <td>{row.input}</td>
                <td>{row.output}</td>
                <td>{row.evaluation}</td>
                <td>{row.relation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatSchemaManualTab(tab: SchemaManualTab): string {
  switch (tab) {
    case "messages":
      return "Provider Messages";
    case "output":
      return "Output";
    case "evaluation":
      return "Evaluation";
    case "compare":
      return "Compare";
  }
}

function buildProviderMessagePreviewSections(): ProviderMessagePreviewSection[] {
  const round = buildSampleRoundSnapshot();
  const conversationMessages = getSampleConversationMessages();
  const maxAssistantTurns = AI_CHECK_CONTRACT.sessionPolicy.maxAssistantTurns;

  return [
    {
      id: "system",
      label: "System Prompt",
      token: "$ systemLevelPrompt",
      role: "system",
      path: "messages[0].content",
      tags: ["Cross-Round Context", "Cross-Turn Context"],
      parts: buildStaticContractPromptParts()
    },
    {
      id: "round",
      label: "Round Context",
      token: "$ trustedRoundContext",
      role: "user",
      path: "messages[1].content",
      tags: ["Round-Level Context"],
      parts: buildTrustedRoundContextParts(round)
    },
    {
      id: "conversation",
      label: "Conversation",
      token: "...conversationMessages",
      role: "assistant/user",
      path: "messages[2...n-1]",
      tags: ["Conversation"],
      previewText: JSON.stringify(conversationMessages, null, 2)
    },
    {
      id: "turn",
      label: "Turn Context",
      token: "$ trustedTurnContext",
      role: "user",
      path: "messages[n].content",
      tags: ["Turn-Level Context"],
      parts: buildTrustedTurnContextParts({
        assistantTurnCount: 1,
        nextAssistantTurn: 2,
        maxAssistantTurns,
        isFinalTurn: false
      })
    }
  ];
}

function buildSampleRoundSnapshot() {
  return buildRoundSnapshot({
    sessionId: "session_example",
    targetId: "target_youtube",
    targetDisplay: "youtube.com",
    strictness: "balanced",
    maxAssistantTurns: AI_CHECK_CONTRACT.sessionPolicy.maxAssistantTurns,
    patternMemorySnapshot: [],
    provider: { id: "openai", model: "gpt-5.4-mini" },
    createdAt: "2026-05-21T00:00:00.000Z"
  });
}

function getSampleConversationMessages(): Array<{ role: "assistant" | "user"; content: string }> {
  return [
    {
      role: "assistant",
      content: "You're trying to open youtube.com. What are you here to do, and why now?"
    },
    {
      role: "user",
      content: "I just want one quick video."
    },
    {
      role: "assistant",
      content: "What specific task do you need YouTube for, and when will you stop?"
    },
    {
      role: "user",
      content: "I need a tutorial for homework and I will close it after 10 minutes."
    }
  ];
}

function buildCompareRows(): CompareRow[] {
  const inputPaths = new Set(AI_CHECK_INPUT_FIELD_REFERENCE.map((field) => field.path));
  const outputPaths = new Set(AI_CHECK_OUTPUT_FIELD_REFERENCE.map((field) => field.path));
  const evaluationPaths = new Set(AI_CHECK_EVALUATION_FIELD_REFERENCE.map((field) => field.path));
  const orderedPaths = [
    ...AI_CHECK_INPUT_FIELD_REFERENCE.map((field) => field.path),
    ...AI_CHECK_OUTPUT_FIELD_REFERENCE.map((field) => field.path),
    ...AI_CHECK_EVALUATION_FIELD_REFERENCE.map((field) => field.path)
  ];
  const paths = [...new Set(orderedPaths)];

  return paths.map((path) => ({
    path,
    input: compareLabel(path, inputPaths, "input"),
    output: compareLabel(path, outputPaths, "output"),
    evaluation: compareLabel(path, evaluationPaths, "evaluation"),
    relation: compareRelation(path, inputPaths, outputPaths, evaluationPaths)
  }));
}

function compareLabel(path: string, paths: Set<string>, section: "input" | "output" | "evaluation"): string {
  if (paths.has(path)) return "Yes";
  if (section === "evaluation" && path === "decision" && paths.has("eval.expectedOutput.decision")) {
    return "Asserted";
  }
  if (section === "evaluation" && path.startsWith("input.") && paths.has("input")) {
    return "Nested";
  }
  if (section === "output" && path === "output.parsed") {
    return "Captured";
  }
  return "No";
}

function compareRelation(
  path: string,
  inputPaths: Set<string>,
  outputPaths: Set<string>,
  evaluationPaths: Set<string>
): string {
  if (path === "decision" && outputPaths.has(path) && evaluationPaths.has("eval.expectedOutput.decision")) {
    return "Output decision is the primary expected decision assertion.";
  }
  if (path === "input" && evaluationPaths.has(path)) {
    return "Evaluation embeds the model input fixture.";
  }
  if (path === "output.parsed") {
    return "Optional captured provider output for inspection, not the expected answer.";
  }
  if (path.startsWith("eval.")) {
    return "PM-authored evaluation assertion or reporting metadata.";
  }
  if (inputPaths.has(path)) {
    return "Runtime context used to build the provider request.";
  }
  if (outputPaths.has(path)) {
    return "Provider response field parsed into product behavior.";
  }
  return "";
}

function findFirstExampleFieldPath(example: unknown, fields: AICheckSchemaFieldReference[]): string | null {
  const fieldPaths = new Set(fields.map((field) => field.path));

  function visit(value: unknown, path: string): string | null {
    if (path && fieldPaths.has(path)) return path;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const match = visit(value[index], path ? `${path}.${index}` : String(index));
        if (match) return match;
      }
    }
    if (value && typeof value === "object") {
      for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
        const match = visit(childValue, path ? `${path}.${key}` : key);
        if (match) return match;
      }
    }
    return null;
  }

  return visit(example, "");
}

function formatExampleScalar(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value) ?? "undefined";
}

function findSchemaSelection(nodes: SchemaTreeNode[], path: string): SchemaSelection | null {
  for (const node of nodes) {
    if (node.path === path) return { node, field: node.field };
    const childSelection = findSchemaSelection(node.children, path);
    if (childSelection) return childSelection;
  }
  return null;
}

function findFirstSchemaSelection(nodes: SchemaTreeNode[]): SchemaSelection | null {
  for (const node of nodes) {
    if (node.field) return { node, field: node.field };
    const childSelection = findFirstSchemaSelection(node.children);
    if (childSelection) return childSelection;
    return { node };
  }
  return null;
}

function getExampleAtPath(example: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, example);
}

function SchemaTreeItem({
  depth,
  node,
  onSelect,
  selectedPath
}: {
  depth: number;
  node: SchemaTreeNode;
  onSelect: (path: string) => void;
  selectedPath: string;
}) {
  const defaultOpen = node.children.length > 0;
  const field = node.field;
  const detailsId = `schema-field-${node.path.replaceAll(".", "-")}`;
  const selected = selectedPath === node.path;

  return (
    <details className={selected ? "schema-tree-item schema-tree-item-selected" : "schema-tree-item"} open={defaultOpen}>
      <summary
        className="schema-tree-summary"
        aria-controls={detailsId}
        aria-selected={selected}
        onClick={() => onSelect(node.path)}
        onFocus={() => onSelect(node.path)}
      >
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
              <SchemaTreeItem
                depth={depth + 1}
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
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
