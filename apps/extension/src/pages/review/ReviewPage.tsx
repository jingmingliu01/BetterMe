import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Archive,
  BarChart3,
  BookOpenText,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  History,
  Plus,
  RotateCcw,
  Save,
  Search,
  Upload
} from "lucide-react";
import {
  AI_CHECK_CONTRACT,
  AI_CHECK_BAD_CASE_ERROR_TYPES,
  AI_CHECK_CASE_SETS,
  AI_CHECK_CASE_STATUSES,
  AI_CHECK_COMMON_TAGS,
  AI_CHECK_CURRENT_VERSIONS,
  AI_CHECK_DATASET_TYPES,
  AI_CHECK_DECISIONS,
  AI_CHECK_DECISION_POLICY_RULES,
  AI_CHECK_EVALUATION_SCHEMA_VERSIONS,
  AI_CHECK_OUTPUT_SCHEMA_VERSIONS,
  AI_CHECK_PROMPT_PROGRAM,
  AI_CHECK_PROMPT_VERSIONS,
  AI_CHECK_PROVENANCE_TYPES,
  AI_CHECK_SCORING_RULES,
  AI_CHECK_STRICTNESS_LEVELS
} from "../../shared/ai-check-contract";
import { PROVIDERS } from "../../shared/constants";
import { BUILT_IN_AI_CHECK_CASES } from "../../ai/built-in-eval-cases";
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
  AICheckContractChangePlan,
  AICheckDecisionExpectation,
  AICheckEvalRunFilters,
  AICheckEvalRunMode,
  AICheckEvalRunSummary,
  AICheckExperiment,
  AICheckExperimentArtifactKind,
  AICheckCaseProvenance,
  AICheckPromptCandidate,
  AICheckPromptComparison,
  AICheckPromptPromotion,
  AICheckPromptProgramSuggestion,
  AICheckReleaseDecision,
  AICheckReleaseDecisionStatus,
  AIDecision,
  AIPMReviewSession,
  BadCaseErrorType,
  BadCaseReview,
  AddExperimentArmInput,
  CreateContractChangePlanInput,
  CreateEvalCaseInput,
  CreateExperimentInput,
  CreatePromptCandidateInput,
  GeneratePromptCandidateInput,
  GeneratePromptProgramSuggestionsInput,
  ImportEvalRunArtifactInput,
  LinkExperimentArtifactInput,
  PromotePromptCandidateInput,
  ProviderId,
  ReviewPromptProgramSuggestionItemInput,
  RunPromptComparisonInput,
  StrictnessLevel,
  AICheckSchemaFieldReference,
  UpdateContractChangePlanInput,
  UpdateEvalCaseInput
} from "../../shared/types";
import "../shared/styles.css";

type ReviewArea = "history" | "eval" | "experiment" | "schema";
type SchemaManualTab = "messages" | "rubric" | "output" | "evaluation";
type ExperimentFilterValue<T extends string> = "all" | T;
type EvidenceExpectationValue = "ignore" | "true" | "false";
type CaseOriginFilter = "all" | "built_in" | AICheckCaseProvenance["type"];

interface EvalFormState {
  title: string;
  datasetType: AICheckCase["datasetType"];
  status: AICheckCaseStatus;
  targetDisplay: string;
  strictness: StrictnessLevel;
  userMessage: string;
  expectedDecision: AIDecision;
  tags: string;
  reviewerNote: string;
  userFacingMustMention: string;
  userFacingMustNotMention: string;
  hasExplicitDuration: EvidenceExpectationValue;
  hasReturnPlan: EvidenceExpectationValue;
  archivedReason: string;
}

interface ExperimentFormState {
  mode: AICheckEvalRunMode;
  provider: "mock" | ProviderId;
  model: string;
  datasetType: ExperimentFilterValue<AICheckCase["datasetType"]>;
  status: ExperimentFilterValue<AICheckCaseStatus>;
  tag: string;
  strictness: ExperimentFilterValue<StrictnessLevel>;
  expectedDecision: ExperimentFilterValue<AIDecision>;
  includeArchived: boolean;
}

interface ExperimentArmFormState {
  name: string;
  kind: AddExperimentArmInput["kind"];
  promptCandidateId: string;
  runId: string;
  notes: string;
}

interface PromptCandidateFormState {
  name: string;
  instructionPatch: string;
  rationale: string;
}

interface SchemaManualSection {
  title: string;
  summary: string;
  fields: AICheckSchemaFieldReference[];
  example: unknown;
  schemaSummary?: string;
  promptSchema?: unknown;
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
  value?: unknown;
}

const ERROR_TYPES: Array<{ value: BadCaseErrorType; label: string }> = [
  ...AI_CHECK_BAD_CASE_ERROR_TYPES
];

const COMMON_TAGS = AI_CHECK_COMMON_TAGS;

const EVAL_STATUSES = AI_CHECK_CASE_STATUSES;
const DATASET_TYPES = AI_CHECK_DATASET_TYPES;
const CASE_SETS = AI_CHECK_CASE_SETS;
const BUILT_IN_EVAL_CASE_IDS = new Set(BUILT_IN_AI_CHECK_CASES.map((evalCase) => evalCase.id));

export function ReviewPage() {
  const loadSessions = useCallback(() => sendMessage<AIPMReviewSession[]>({ type: "review/listSessions" }), []);
  const loadEvalCases = useCallback(() => sendMessage<AICheckCase[]>({ type: "review/listEvalCases" }), []);
  const loadEvalRuns = useCallback(() => sendMessage<AICheckEvalRunSummary[]>({ type: "review/listEvalRuns" }), []);
  const loadExperiments = useCallback(() => sendMessage<AICheckExperiment[]>({ type: "review/listExperiments" }), []);
  const loadReleaseDecisions = useCallback(
    () => sendMessage<AICheckReleaseDecision[]>({ type: "review/listReleaseDecisions" }),
    []
  );
  const loadPromptCandidates = useCallback(
    () => sendMessage<AICheckPromptCandidate[]>({ type: "review/listPromptCandidates" }),
    []
  );
  const loadPromptComparisons = useCallback(
    () => sendMessage<AICheckPromptComparison[]>({ type: "review/listPromptComparisons" }),
    []
  );
  const loadPromptPromotions = useCallback(
    () => sendMessage<AICheckPromptPromotion[]>({ type: "review/listPromptPromotions" }),
    []
  );
  const loadPromptProgramSuggestions = useCallback(
    () => sendMessage<AICheckPromptProgramSuggestion[]>({ type: "review/listPromptProgramSuggestions" }),
    []
  );
  const loadContractChangePlans = useCallback(
    () => sendMessage<AICheckContractChangePlan[]>({ type: "review/listContractChangePlans" }),
    []
  );
  const loadProviderStatus = useCallback(() => sendMessage<Record<ProviderId, boolean>>({ type: "provider/status" }), []);
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
  const {
    data: evalRunData,
    error: evalRunError,
    loading: evalRunsLoading,
    refresh: refreshEvalRuns
  } = useAsyncState(loadEvalRuns);
  const {
    data: experimentData,
    error: experimentError,
    loading: experimentsLoading,
    refresh: refreshExperiments
  } = useAsyncState(loadExperiments);
  const {
    data: releaseDecisionData,
    error: releaseDecisionError,
    loading: releaseDecisionsLoading,
    refresh: refreshReleaseDecisions
  } = useAsyncState(loadReleaseDecisions);
  const {
    data: promptCandidateData,
    error: promptCandidateError,
    loading: promptCandidatesLoading,
    refresh: refreshPromptCandidates
  } = useAsyncState(loadPromptCandidates);
  const {
    data: promptComparisonData,
    error: promptComparisonError,
    loading: promptComparisonsLoading,
    refresh: refreshPromptComparisons
  } = useAsyncState(loadPromptComparisons);
  const {
    data: promptPromotionData,
    error: promptPromotionError,
    loading: promptPromotionsLoading,
    refresh: refreshPromptPromotions
  } = useAsyncState(loadPromptPromotions);
  const {
    data: promptProgramSuggestionData,
    error: promptProgramSuggestionError,
    loading: promptProgramSuggestionsLoading,
    refresh: refreshPromptProgramSuggestions
  } = useAsyncState(loadPromptProgramSuggestions);
  const {
    data: contractChangePlanData,
    error: contractChangePlanError,
    loading: contractChangePlansLoading,
    refresh: refreshContractChangePlans
  } = useAsyncState(loadContractChangePlans);
  const {
    data: providerStatusData,
    error: providerStatusError,
    loading: providerStatusLoading,
    refresh: refreshProviderStatus
  } = useAsyncState(loadProviderStatus);
  const [area, setArea] = useState<ReviewArea>("history");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [expectedDecision, setExpectedDecision] = useState<AIDecision | "">("");
  const [errorTypes, setErrorTypes] = useState<BadCaseErrorType[]>([]);
  const [reviewerNote, setReviewerNote] = useState("");
  const [selectedSetId, setSelectedSetId] = useState("active");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedCaseOrigin, setSelectedCaseOrigin] = useState<CaseOriginFilter>("all");
  const [caseSearch, setCaseSearch] = useState("");
  const [selectedEvalCaseId, setSelectedEvalCaseId] = useState<string | null>(null);
  const [creatingEvalCase, setCreatingEvalCase] = useState(false);
  const [evalForm, setEvalForm] = useState<EvalFormState>(emptyEvalForm());
  const [experimentForm, setExperimentForm] = useState<ExperimentFormState>({
    mode: "tuning",
    provider: "mock",
    model: "mock",
    datasetType: "regression",
    status: "ready",
    tag: "all",
    strictness: "all",
    expectedDecision: "all",
    includeArchived: false
  });
  const [selectedEvalRunId, setSelectedEvalRunId] = useState<string | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [experimentName, setExperimentName] = useState("");
  const [experimentNotes, setExperimentNotes] = useState("");
  const [experimentArmForm, setExperimentArmForm] = useState<ExperimentArmFormState>(emptyExperimentArmForm());
  const [selectedPromptCandidateId, setSelectedPromptCandidateId] = useState<string | null>(null);
  const [selectedPromptComparisonId, setSelectedPromptComparisonId] = useState<string | null>(null);
  const [promptCandidateForm, setPromptCandidateForm] = useState<PromptCandidateFormState>(emptyPromptCandidateForm());
  const [promptPromotionNote, setPromptPromotionNote] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [evalRunImportText, setEvalRunImportText] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningEval, setRunningEval] = useState(false);
  const [runningPromptComparison, setRunningPromptComparison] = useState(false);
  const [generatingPromptCandidate, setGeneratingPromptCandidate] = useState(false);
  const [generatingPromptProgramSuggestions, setGeneratingPromptProgramSuggestions] = useState(false);
  const [reviewingPromptProgramSuggestionItemId, setReviewingPromptProgramSuggestionItemId] = useState<string | null>(null);
  const [creatingContractChangePlanItemId, setCreatingContractChangePlanItemId] = useState<string | null>(null);
  const [updatingContractChangePlanId, setUpdatingContractChangePlanId] = useState<string | null>(null);
  const [contractChangePlanNotes, setContractChangePlanNotes] = useState<Record<string, string>>({});
  const [promotingPromptCandidate, setPromotingPromptCandidate] = useState(false);
  const [importingEvalRun, setImportingEvalRun] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const sessions = sessionData ?? [];
  const evalCases = evalData ?? [];
  const evalRuns = evalRunData ?? [];
  const experiments = experimentData ?? [];
  const releaseDecisions = releaseDecisionData ?? [];
  const promptCandidates = promptCandidateData ?? [];
  const promptComparisons = promptComparisonData ?? [];
  const promptPromotions = promptPromotionData ?? [];
  const promptProgramSuggestions = promptProgramSuggestionData ?? [];
  const contractChangePlans = contractChangePlanData ?? [];
  const selectedSession = useMemo(
    () => sessions.find((item) => item.session.id === selectedSessionId) ?? sessions[0] ?? null,
    [selectedSessionId, sessions]
  );
  const latestDecision = selectedSession?.decisions.at(-1) ?? null;
  const selectedDecision =
    selectedSession?.decisions.find((decision) => decision.id === selectedDecisionId) ?? latestDecision;
  const selectedBadCase = selectedSession
    ? (selectedSession.badCases?.find((badCase) => badCase.sourceDecisionId === selectedDecision?.id) ??
      (selectedSession.badCase?.sourceDecisionId === selectedDecision?.id ? selectedSession.badCase : null))
    : null;

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
      if (selectedCaseOrigin === "built_in" && !isBuiltInEvalCase(evalCase)) return false;
      if (selectedCaseOrigin !== "all" && selectedCaseOrigin !== "built_in" && evalCase.provenance.type !== selectedCaseOrigin) {
        return false;
      }
      if (!query) return true;
      return [
        evalCase.title,
        evalCase.input.targetDisplay,
        evalCase.eval?.expectedOutput.decision,
        evalCase.input.strictness,
        evalCase.provenance.type,
        isBuiltInEvalCase(evalCase) ? "built in default fixture" : "",
        ...(evalCase.eval?.tags ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [caseSearch, evalCases, selectedCaseOrigin, selectedSet, selectedTag]);

  const selectedEvalCase = useMemo(() => {
    if (creatingEvalCase) return null;
    return (
      filteredEvalCases.find((item) => item.id === selectedEvalCaseId) ??
      filteredEvalCases[0] ??
      evalCases.find((item) => item.id === selectedEvalCaseId) ??
      null
    );
  }, [creatingEvalCase, evalCases, filteredEvalCases, selectedEvalCaseId]);
  const selectedEvalRun = useMemo(
    () => evalRuns.find((item) => item.run.id === selectedEvalRunId) ?? evalRuns[0] ?? null,
    [evalRuns, selectedEvalRunId]
  );
  const selectedPromptCandidate = useMemo(
    () =>
      promptCandidates.find((candidate) => candidate.id === selectedPromptCandidateId) ??
      promptCandidates.find((candidate) => candidate.status === "draft") ??
      null,
    [promptCandidates, selectedPromptCandidateId]
  );
  const selectedPromptComparison = useMemo(
    () =>
      promptComparisons.find((comparison) => comparison.id === selectedPromptComparisonId) ??
      promptComparisons[0] ??
      null,
    [promptComparisons, selectedPromptComparisonId]
  );
  const activePromptPromotion = promptPromotions[0] ?? null;
  const selectedExperiment = useMemo(
    () => experiments.find((experiment) => experiment.id === selectedExperimentId) ?? experiments[0] ?? null,
    [experiments, selectedExperimentId]
  );

  useEffect(() => {
    if (!selectedSession) return;
    setSelectedSessionId(selectedSession.session.id);
    setSelectedDecisionId(selectedSession.badCase?.sourceDecisionId ?? selectedSession.decisions.at(-1)?.id ?? null);
  }, [selectedSession?.session.id, selectedSession?.badCase?.sourceDecisionId]);

  useEffect(() => {
    setExpectedDecision(selectedBadCase?.expectedDecision ?? "");
    setErrorTypes(selectedBadCase?.errorTypes ?? []);
    setReviewerNote(selectedBadCase?.reviewerNote ?? "");
  }, [selectedBadCase?.id, selectedDecision?.id]);

  useEffect(() => {
    if (creatingEvalCase) {
      setEvalForm(emptyEvalForm());
    } else if (selectedEvalCase) {
      setSelectedEvalCaseId(selectedEvalCase.id);
      setEvalForm(formFromEvalCase(selectedEvalCase));
    }
  }, [creatingEvalCase, selectedEvalCase?.id]);

  async function refreshAll() {
    await Promise.all([refreshSessions(), refreshEvalCases(), refreshEvalRuns()]);
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
      const badCase = selectedBadCase
        ? await sendMessage<BadCaseReview>({
            type: "review/updateBadCase",
            payload: {
              id: selectedBadCase.id,
              ...payload
            }
          })
        : await sendMessage<BadCaseReview>({
            type: "review/createBadCase",
            payload: {
              sessionId: selectedSession.session.id,
              decisionId: selectedDecision?.id ?? null,
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
    if (!selectedBadCase) return;
    setSaving(true);
    setStatus(null);
    try {
      const evalCase = await sendMessage<AICheckCase>({
        type: "review/convertBadCaseToEval",
        payload: { badCaseId: selectedBadCase.id }
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
        datasetType: evalForm.datasetType,
        userFacingMustMention: splitList(evalForm.userFacingMustMention),
        userFacingMustNotMention: splitList(evalForm.userFacingMustNotMention),
        expectedInputEvidence: buildExpectedInputEvidence(evalForm)
      };
      const saved = creatingEvalCase
        ? await sendMessage<AICheckCase>({
            type: "review/createEvalCase",
            payload: base satisfies CreateEvalCaseInput
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
      setSelectedSetId(saved.datasetType === "regression" ? "regression" : saved.status === "draft" ? "draft" : "active");
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

  async function runExperiment() {
    setRunningEval(true);
    setStatus(null);
    try {
      const summary = await sendMessage<AICheckEvalRunSummary>({
        type: "review/runEvalExperiment",
        payload: {
          filters: buildExperimentFilters(experimentForm),
          mode: experimentForm.mode,
          provider: experimentForm.provider,
          model: experimentForm.model
        }
      });
      setSelectedEvalRunId(summary.run.id);
      setStatus(
        `Experiment ${summary.run.id} finished: ${summary.run.metrics.passed}/${summary.run.metrics.total} cases passed.`
      );
      await Promise.all([refreshEvalRuns(), refreshEvalCases()]);
    } catch (runError) {
      setStatus(runError instanceof Error ? runError.message : "Could not run eval experiment.");
    } finally {
      setRunningEval(false);
    }
  }

  async function importEvalRunArtifact() {
    setImportingEvalRun(true);
    setStatus(null);
    try {
      const parsed = JSON.parse(evalRunImportText) as ImportEvalRunArtifactInput["artifact"];
      const summary = await sendMessage<AICheckEvalRunSummary>({
        type: "review/importEvalRunArtifact",
        payload: { artifact: parsed }
      });
      setSelectedEvalRunId(summary.run.id);
      setEvalRunImportText("");
      setStatus(`Imported eval run ${summary.run.id}: ${summary.run.metrics.passed}/${summary.run.metrics.total} cases passed.`);
      await refreshEvalRuns();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import eval run artifact.");
    } finally {
      setImportingEvalRun(false);
    }
  }

  async function savePromptCandidate() {
    setSaving(true);
    setStatus(null);
    try {
      const candidate = await sendMessage<AICheckPromptCandidate>({
        type: "review/createPromptCandidate",
        payload: {
          name: promptCandidateForm.name,
          instructionPatch: promptCandidateForm.instructionPatch,
          rationale: promptCandidateForm.rationale
        } satisfies CreatePromptCandidateInput
      });
      setSelectedPromptCandidateId(candidate.id);
      setPromptCandidateForm(emptyPromptCandidateForm());
      setStatus(`Saved prompt candidate ${candidate.name}.`);
      await refreshPromptCandidates();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save prompt candidate.");
    } finally {
      setSaving(false);
    }
  }

  async function runPromptComparison() {
    if (!selectedPromptCandidate) return;
    setRunningPromptComparison(true);
    setStatus(null);
    try {
      const comparison = await sendMessage<AICheckPromptComparison>({
        type: "review/runPromptComparison",
        payload: {
          candidateId: selectedPromptCandidate.id,
          filters: buildExperimentFilters(experimentForm),
          mode: experimentForm.mode,
          provider: experimentForm.provider,
          model: experimentForm.model
        } satisfies RunPromptComparisonInput
      });
      setSelectedPromptComparisonId(comparison.id);
      setSelectedEvalRunId(comparison.candidateRunId);
      setStatus(
        `Candidate A/B finished: ${comparison.improvedCaseIds.length} improved, ${comparison.regressedCaseIds.length} regressed.`
      );
      await Promise.all([refreshPromptComparisons(), refreshEvalRuns()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not run Candidate Prompt A/B.");
    } finally {
      setRunningPromptComparison(false);
    }
  }

  async function promoteSelectedPromptCandidate() {
    if (!selectedPromptComparison) return;
    setPromotingPromptCandidate(true);
    setStatus(null);
    try {
      const promotion = await sendMessage<AICheckPromptPromotion>({
        type: "review/promotePromptCandidate",
        payload: {
          comparisonId: selectedPromptComparison.id,
          note: promptPromotionNote
        } satisfies PromotePromptCandidateInput
      });
      setPromptPromotionNote("");
      setStatus(`Promoted prompt program ${promotion.promptVersion}.`);
      await refreshPromptPromotions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not promote prompt candidate.");
    } finally {
      setPromotingPromptCandidate(false);
    }
  }

  async function generateCandidateFromSelectedComparison() {
    if (!selectedPromptComparison) return;
    setGeneratingPromptCandidate(true);
    setStatus(null);
    try {
      const candidate = await sendMessage<AICheckPromptCandidate>({
        type: "review/generatePromptCandidate",
        payload: {
          comparisonId: selectedPromptComparison.id,
          provider: experimentForm.provider,
          model: experimentForm.model
        } satisfies GeneratePromptCandidateInput
      });
      setSelectedPromptCandidateId(candidate.id);
      setStatus(`Generated prompt candidate ${candidate.name}.`);
      await refreshPromptCandidates();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate prompt candidate.");
    } finally {
      setGeneratingPromptCandidate(false);
    }
  }

  async function generateSuggestionsFromSelectedComparison() {
    if (!selectedPromptComparison) return;
    setGeneratingPromptProgramSuggestions(true);
    setStatus(null);
    try {
      const suggestion = await sendMessage<AICheckPromptProgramSuggestion>({
        type: "review/generatePromptProgramSuggestions",
        payload: {
          comparisonId: selectedPromptComparison.id,
          provider: experimentForm.provider,
          model: experimentForm.model
        } satisfies GeneratePromptProgramSuggestionsInput
      });
      setStatus(`Generated ${suggestion.items.length} Prompt Program suggestions.`);
      await refreshPromptProgramSuggestions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate Prompt Program suggestions.");
    } finally {
      setGeneratingPromptProgramSuggestions(false);
    }
  }

  async function reviewPromptProgramSuggestionItem(input: ReviewPromptProgramSuggestionItemInput) {
    setReviewingPromptProgramSuggestionItemId(input.itemId);
    setStatus(null);
    try {
      await sendMessage<AICheckPromptProgramSuggestion>({
        type: "review/reviewPromptProgramSuggestionItem",
        payload: input
      });
      setStatus(`Suggestion ${input.status} for contract-first workflow.`);
      await refreshPromptProgramSuggestions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not review Prompt Program suggestion.");
    } finally {
      setReviewingPromptProgramSuggestionItemId(null);
    }
  }

  async function createContractChangePlan(input: CreateContractChangePlanInput) {
    setCreatingContractChangePlanItemId(input.itemId);
    setStatus(null);
    try {
      const plan = await sendMessage<AICheckContractChangePlan>({
        type: "review/createContractChangePlan",
        payload: input
      });
      setStatus(`Contract change plan created: ${plan.title}.`);
      await refreshContractChangePlans();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create contract change plan.");
    } finally {
      setCreatingContractChangePlanItemId(null);
    }
  }

  async function updateContractChangePlan(input: UpdateContractChangePlanInput) {
    setUpdatingContractChangePlanId(input.id);
    setStatus(null);
    try {
      const plan = await sendMessage<AICheckContractChangePlan>({
        type: "review/updateContractChangePlan",
        payload: input
      });
      setStatus(`Contract change plan marked ${formatTag(plan.status)}.`);
      setContractChangePlanNotes((current) => ({
        ...current,
        [plan.id]: plan.implementationNote ?? ""
      }));
      await refreshContractChangePlans();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update contract change plan.");
    } finally {
      setUpdatingContractChangePlanId(null);
    }
  }

  async function createExperimentWorkspace() {
    setSaving(true);
    setStatus(null);
    try {
      const experiment = await sendMessage<AICheckExperiment>({
        type: "review/createExperiment",
        payload: {
          name: experimentName,
          notes: experimentNotes
        } satisfies CreateExperimentInput
      });
      setSelectedExperimentId(experiment.id);
      setExperimentName("");
      setExperimentNotes("");
      setStatus(`Experiment workspace saved: ${experiment.name}.`);
      await refreshExperiments();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save experiment workspace.");
    } finally {
      setSaving(false);
    }
  }

  async function linkSelectedExperimentArtifact(artifactKind: AICheckExperimentArtifactKind, artifactId: string | null | undefined) {
    if (!selectedExperiment || !artifactId) return;
    setSaving(true);
    setStatus(null);
    try {
      const experiment = await sendMessage<AICheckExperiment>({
        type: "review/linkExperimentArtifact",
        payload: {
          experimentId: selectedExperiment.id,
          artifactKind,
          artifactId
        } satisfies LinkExperimentArtifactInput
      });
      setStatus(`Linked ${formatTag(artifactKind)} to ${experiment.name}.`);
      await refreshExperiments();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not link artifact to experiment.");
    } finally {
      setSaving(false);
    }
  }

  async function addExperimentArm() {
    if (!selectedExperiment) return;
    setSaving(true);
    setStatus(null);
    try {
      const experiment = await sendMessage<AICheckExperiment>({
        type: "review/addExperimentArm",
        payload: {
          experimentId: selectedExperiment.id,
          name: experimentArmForm.name,
          kind: experimentArmForm.kind,
          promptCandidateId: experimentArmForm.promptCandidateId || undefined,
          runId: experimentArmForm.runId || undefined,
          notes: experimentArmForm.notes
        } satisfies AddExperimentArmInput
      });
      setExperimentArmForm(emptyExperimentArmForm());
      setStatus(`Added arm to ${experiment.name}.`);
      await refreshExperiments();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add experiment arm.");
    } finally {
      setSaving(false);
    }
  }

  async function createReleaseDecision(decision: AICheckReleaseDecisionStatus) {
    if (!selectedEvalRun) return;
    setSaving(true);
    setStatus(null);
    try {
      const saved = await sendMessage<AICheckReleaseDecision>({
        type: "review/createReleaseDecision",
        payload: {
          runId: selectedEvalRun.run.id,
          decision,
          note: releaseNote
        }
      });
      setStatus(`Release decision saved: ${formatReleaseDecision(saved.decision)}.`);
      setReleaseNote("");
      await refreshReleaseDecisions();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save release decision.");
    } finally {
      setSaving(false);
    }
  }

  if (
    (sessionsLoading && !sessionData) ||
    (evalLoading && !evalData) ||
    (evalRunsLoading && !evalRunData) ||
    (experimentsLoading && !experimentData) ||
    (releaseDecisionsLoading && !releaseDecisionData) ||
    (promptCandidatesLoading && !promptCandidateData) ||
    (promptComparisonsLoading && !promptComparisonData) ||
    (promptPromotionsLoading && !promptPromotionData) ||
    (promptProgramSuggestionsLoading && !promptProgramSuggestionData) ||
    (contractChangePlansLoading && !contractChangePlanData) ||
    (providerStatusLoading && !providerStatusData)
  ) {
    return <AppShell title="AI PM Review" subtitle="Loading local AI quality workspace..." />;
  }

  return (
    <AppShell title="AI PM Review" subtitle="Review history, curate evaluation cases, and keep the Prompt Program contract visible.">
      {(sessionError ||
        evalError ||
        evalRunError ||
        experimentError ||
        releaseDecisionError ||
        promptCandidateError ||
        promptComparisonError ||
        promptPromotionError ||
        promptProgramSuggestionError ||
        contractChangePlanError ||
        providerStatusError) && (
        <p className="badge badge-danger">
          {sessionError ??
            evalError ??
            evalRunError ??
            experimentError ??
            releaseDecisionError ??
            promptCandidateError ??
            promptComparisonError ??
            promptPromotionError ??
            promptProgramSuggestionError ??
            contractChangePlanError ??
            providerStatusError}
        </p>
      )}
      {status && <p className="badge">{status}</p>}
      <nav className="review-area-tabs" aria-label="PM Review areas">
        <AreaButton active={area === "history"} icon={<History size={16} />} label="History Cases" onClick={() => setArea("history")} />
        <AreaButton active={area === "eval"} icon={<FlaskConical size={16} />} label="Evaluation Cases" onClick={() => setArea("eval")} />
        <AreaButton active={area === "experiment"} icon={<BarChart3 size={16} />} label="Experiment Lab" onClick={() => setArea("experiment")} />
        <AreaButton active={area === "schema"} icon={<BookOpenText size={16} />} label="Contract Reference" onClick={() => setArea("schema")} />
      </nav>

      {area === "history" && (
        <HistoryCases
          errorTypes={errorTypes}
          expectedDecision={expectedDecision}
          selectedBadCase={selectedBadCase}
          selectedDecisionId={selectedDecision?.id ?? null}
          setSelectedDecisionId={setSelectedDecisionId}
          reviewerNote={reviewerNote}
          saving={saving}
          selected={selectedSession}
          sessionsLoading={sessionsLoading}
          sessions={sessions}
          setErrorTypes={setErrorTypes}
          setExpectedDecision={setExpectedDecision}
          setReviewerNote={setReviewerNote}
          setSelectedSessionId={setSelectedSessionId}
          onConvert={convertToEvalCase}
          onRefresh={() => void refreshSessions()}
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
              <span>Case origin</span>
              <select
                aria-label="Case origin"
                className="select"
                value={selectedCaseOrigin}
                onChange={(event) => setSelectedCaseOrigin(event.target.value as CaseOriginFilter)}
              >
                <option value="all">All origins</option>
                <option value="built_in">Built-in defaults</option>
                {AI_CHECK_PROVENANCE_TYPES.map((provenanceType) => (
                  <option key={provenanceType} value={provenanceType}>
                    {formatCaseProvenance(provenanceType)}
                  </option>
                ))}
              </select>
            </label>

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
              <div className="row">
                <button
                  aria-label="Refresh evaluation cases"
                  className="icon-btn"
                  disabled={evalLoading}
                  title="Refresh evaluation cases"
                  onClick={() => void refreshEvalCases()}
                >
                  <RotateCcw size={16} />
                </button>
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
                    <div className="row wrap-row">
                      <span className="badge">{formatCaseProvenance(evalCase.provenance.type)}</span>
                      {isBuiltInEvalCase(evalCase) && <span className="badge badge-warn">Built-in default</span>}
                    </div>
                    <span>{evalCase.input.targetDisplay}</span>
                    <small>
                      {formatDecision(getPrimaryExpectedDecision(evalCase.eval?.expectedOutput.decision))} · {evalCase.input.strictness} ·{" "}
                      {formatTag(evalCase.datasetType)}
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

      {area === "experiment" && (
        <ExperimentLab
          availableTags={availableTags}
          evalCases={evalCases}
          form={experimentForm}
          loading={evalRunsLoading}
          experimentArmForm={experimentArmForm}
          experimentName={experimentName}
          experimentNotes={experimentNotes}
          experiments={experiments}
          providerStatus={providerStatusData ?? {}}
          releaseDecisions={releaseDecisions}
          releaseNote={releaseNote}
          importText={evalRunImportText}
          importing={importingEvalRun}
          activePromptPromotion={activePromptPromotion}
          generatingPromptCandidate={generatingPromptCandidate}
          generatingPromptProgramSuggestions={generatingPromptProgramSuggestions}
          promptCandidateForm={promptCandidateForm}
          promptCandidates={promptCandidates}
          promptComparisons={promptComparisons}
          promptProgramSuggestions={promptProgramSuggestions}
          promptPromotionNote={promptPromotionNote}
          promptPromotions={promptPromotions}
          reviewingPromptProgramSuggestionItemId={reviewingPromptProgramSuggestionItemId}
          promotingPromptCandidate={promotingPromptCandidate}
          running={runningEval}
          runningPromptComparison={runningPromptComparison}
          savingReleaseDecision={saving}
          runs={evalRuns}
          selectedPromptCandidate={selectedPromptCandidate}
          selectedPromptComparison={selectedPromptComparison}
          selectedRun={selectedEvalRun}
          selectedExperiment={selectedExperiment}
          setExperimentArmForm={setExperimentArmForm}
          setForm={setExperimentForm}
          setExperimentName={setExperimentName}
          setExperimentNotes={setExperimentNotes}
          setReleaseNote={setReleaseNote}
          setImportText={setEvalRunImportText}
          setPromptCandidateForm={setPromptCandidateForm}
          setPromptPromotionNote={setPromptPromotionNote}
          setSelectedPromptCandidateId={setSelectedPromptCandidateId}
          setSelectedPromptComparisonId={setSelectedPromptComparisonId}
          setSelectedExperimentId={setSelectedExperimentId}
          setSelectedRunId={setSelectedEvalRunId}
          onAddExperimentArm={addExperimentArm}
          onCreateReleaseDecision={createReleaseDecision}
          onCreateExperiment={createExperimentWorkspace}
          onCreatePromptCandidate={savePromptCandidate}
          onGeneratePromptCandidate={generateCandidateFromSelectedComparison}
          onGeneratePromptProgramSuggestions={generateSuggestionsFromSelectedComparison}
          onImportRun={importEvalRunArtifact}
          onPromotePromptCandidate={promoteSelectedPromptCandidate}
          onReviewPromptProgramSuggestionItem={reviewPromptProgramSuggestionItem}
          onLinkExperimentArtifact={linkSelectedExperimentArtifact}
          onRefresh={() =>
            void Promise.all([
              refreshEvalRuns(),
              refreshExperiments(),
              refreshProviderStatus(),
              refreshReleaseDecisions(),
              refreshPromptCandidates(),
              refreshPromptComparisons(),
              refreshContractChangePlans(),
              refreshPromptProgramSuggestions(),
              refreshPromptPromotions()
            ])
          }
          onRun={runExperiment}
          onRunPromptComparison={runPromptComparison}
        />
      )}

      {area === "schema" && (
        <SchemaReference
          contractChangePlanNotes={contractChangePlanNotes}
          contractChangePlans={contractChangePlans}
          creatingContractChangePlanItemId={creatingContractChangePlanItemId}
          onCreateContractChangePlan={createContractChangePlan}
          onSetContractChangePlanNote={(planId, note) =>
            setContractChangePlanNotes((current) => ({
              ...current,
              [planId]: note
            }))
          }
          onUpdateContractChangePlan={updateContractChangePlan}
          promptProgramSuggestions={promptProgramSuggestions}
          updatingContractChangePlanId={updatingContractChangePlanId}
        />
      )}
    </AppShell>
  );
}

function ExperimentLab({
  availableTags,
  evalCases,
  experimentArmForm,
  experimentName,
  experimentNotes,
  experiments,
  form,
  generatingPromptCandidate,
  generatingPromptProgramSuggestions,
  importText,
  importing,
  activePromptPromotion,
  loading,
  promptCandidateForm,
  promptCandidates,
  promptComparisons,
  promptProgramSuggestions,
  promptPromotionNote,
  promptPromotions,
  reviewingPromptProgramSuggestionItemId,
  promotingPromptCandidate,
  providerStatus,
  releaseDecisions,
  releaseNote,
  running,
  runningPromptComparison,
  savingReleaseDecision,
  runs,
  selectedPromptCandidate,
  selectedPromptComparison,
  selectedExperiment,
  selectedRun,
  setExperimentArmForm,
  setExperimentName,
  setExperimentNotes,
  setForm,
  setImportText,
  setPromptCandidateForm,
  setPromptPromotionNote,
  setReleaseNote,
  setSelectedPromptCandidateId,
  setSelectedPromptComparisonId,
  setSelectedExperimentId,
  setSelectedRunId,
  onAddExperimentArm,
  onCreateReleaseDecision,
  onCreateExperiment,
  onCreatePromptCandidate,
  onGeneratePromptCandidate,
  onGeneratePromptProgramSuggestions,
  onImportRun,
  onLinkExperimentArtifact,
  onPromotePromptCandidate,
  onReviewPromptProgramSuggestionItem,
  onRefresh,
  onRun,
  onRunPromptComparison
}: {
  availableTags: string[];
  evalCases: AICheckCase[];
  experimentArmForm: ExperimentArmFormState;
  experimentName: string;
  experimentNotes: string;
  experiments: AICheckExperiment[];
  form: ExperimentFormState;
  generatingPromptCandidate: boolean;
  generatingPromptProgramSuggestions: boolean;
  importText: string;
  importing: boolean;
  activePromptPromotion: AICheckPromptPromotion | null;
  loading: boolean;
  promptCandidateForm: PromptCandidateFormState;
  promptCandidates: AICheckPromptCandidate[];
  promptComparisons: AICheckPromptComparison[];
  promptProgramSuggestions: AICheckPromptProgramSuggestion[];
  promptPromotionNote: string;
  promptPromotions: AICheckPromptPromotion[];
  reviewingPromptProgramSuggestionItemId: string | null;
  promotingPromptCandidate: boolean;
  providerStatus: Partial<Record<ProviderId, boolean>>;
  releaseDecisions: AICheckReleaseDecision[];
  releaseNote: string;
  running: boolean;
  runningPromptComparison: boolean;
  savingReleaseDecision: boolean;
  runs: AICheckEvalRunSummary[];
  selectedPromptCandidate: AICheckPromptCandidate | null;
  selectedPromptComparison: AICheckPromptComparison | null;
  selectedExperiment: AICheckExperiment | null;
  selectedRun: AICheckEvalRunSummary | null;
  setExperimentArmForm: (value: ExperimentArmFormState | ((current: ExperimentArmFormState) => ExperimentArmFormState)) => void;
  setExperimentName: (value: string) => void;
  setExperimentNotes: (value: string) => void;
  setForm: (value: ExperimentFormState | ((current: ExperimentFormState) => ExperimentFormState)) => void;
  setImportText: (value: string) => void;
  setPromptCandidateForm: (value: PromptCandidateFormState | ((current: PromptCandidateFormState) => PromptCandidateFormState)) => void;
  setPromptPromotionNote: (value: string) => void;
  setReleaseNote: (value: string) => void;
  setSelectedPromptCandidateId: (value: string) => void;
  setSelectedPromptComparisonId: (value: string) => void;
  setSelectedExperimentId: (value: string) => void;
  setSelectedRunId: (value: string) => void;
  onAddExperimentArm: () => void;
  onCreateReleaseDecision: (decision: AICheckReleaseDecisionStatus) => void;
  onCreateExperiment: () => void;
  onCreatePromptCandidate: () => void;
  onGeneratePromptCandidate: () => void;
  onGeneratePromptProgramSuggestions: () => void;
  onImportRun: () => void;
  onLinkExperimentArtifact: (artifactKind: AICheckExperimentArtifactKind, artifactId: string | null | undefined) => void;
  onPromotePromptCandidate: () => void;
  onReviewPromptProgramSuggestionItem: (input: ReviewPromptProgramSuggestionItemInput) => void;
  onRefresh: () => void;
  onRun: () => void;
  onRunPromptComparison: () => void;
}) {
  const matchingCaseCount = useMemo(
    () => evalCases.filter((evalCase) => caseMatchesExperiment(evalCase, buildExperimentFilters(form))).length,
    [evalCases, form]
  );
  const failedResults = selectedRun?.results.filter((result) => !result.pass) ?? [];
  const caseById = useMemo(() => new Map(evalCases.map((evalCase) => [evalCase.id, evalCase])), [evalCases]);
  const selectedRunHasHoldout =
    selectedRun?.run.caseIds.some((caseId) => caseById.get(caseId)?.datasetType === "holdout") ?? false;
  const holdoutDetailsHidden = Boolean(selectedRun && selectedRunHasHoldout && selectedRun.run.mode !== "release_review");
  const providerReady = form.provider === "mock" || Boolean(providerStatus[form.provider]);
  const selectedProviderConfig = form.provider === "mock" ? null : PROVIDERS.find((provider) => provider.id === form.provider);
  const availableModels = form.provider === "mock" ? ["mock"] : selectedProviderConfig?.models ?? [];
  const selectedReleaseDecisions = selectedRun
    ? releaseDecisions.filter((decision) => decision.runId === selectedRun.run.id)
    : [];
  const latestReleaseDecision = selectedReleaseDecisions[0] ?? null;
  const selectedComparisonSuggestion =
    promptProgramSuggestions.find((suggestion) => suggestion.comparisonId === selectedPromptComparison?.id) ?? null;
  const selectedComparisonPromotion =
    promptPromotions.find((promotion) => promotion.comparisonId === selectedPromptComparison?.id) ?? null;
  const releaseReviewRequiredForApproval = Boolean(
    selectedRun && selectedRunHasHoldout && selectedRun.run.mode !== "release_review"
  );
  const canApproveSelectedRun =
    Boolean(selectedRun) &&
    selectedRun?.run.metrics.releaseGate.status !== "fail" &&
    !releaseReviewRequiredForApproval &&
    !savingReleaseDecision;

  return (
    <section className="experiment-workspace">
      <aside className="panel experiment-control-panel stack">
        <div className="section-heading">
          <span className="section-label">Experiment Lab</span>
          <h2>Current Prompt Program</h2>
        </div>
        <div className="status-list">
          <StatusItem label="Prompt" value={AI_CHECK_CURRENT_VERSIONS.promptVersion} />
          <StatusItem label="Active patch" value={activePromptPromotion ? activePromptPromotion.promptVersion : "None"} />
          <StatusItem label="Provider" value={formatProvider(form.provider)} />
          <StatusItem label="Model" value={form.model} />
          <StatusItem label="Mode" value={formatRunMode(form.mode)} />
        </div>

        <section className="stack compact-stack">
          <span className="section-label">Experiment Workspace</span>
          <label className="stack compact-stack">
            <span>Workspace</span>
            <select
              aria-label="Experiment workspace"
              className="select"
              value={selectedExperiment?.id ?? ""}
              onChange={(event) => setSelectedExperimentId(event.target.value)}
            >
              <option value="">No workspace selected</option>
              {experiments.map((experiment) => (
                <option key={experiment.id} value={experiment.id}>
                  {experiment.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Name</span>
            <input
              aria-label="Experiment workspace name"
              className="input"
              placeholder="Release strictness tuning"
              value={experimentName}
              onChange={(event) => setExperimentName(event.target.value)}
            />
          </label>
          <label className="stack compact-stack">
            <span>Notes</span>
            <textarea
              aria-label="Experiment workspace notes"
              className="textarea"
              placeholder="Hypothesis, target dataset, and decision criteria"
              value={experimentNotes}
              onChange={(event) => setExperimentNotes(event.target.value)}
            />
          </label>
          <button className="btn btn-ghost" disabled={experimentName.trim().length === 0} onClick={onCreateExperiment}>
            <Save size={16} /> Save Workspace
          </button>
          {selectedExperiment && (
            <>
              <div className="metric-grid">
                <MetricCard label="Arms" value={String(selectedExperiment.arms?.length ?? 0)} />
                <MetricCard label="Runs" value={String(selectedExperiment.artifactIds.runIds.length)} />
                <MetricCard label="Comparisons" value={String(selectedExperiment.artifactIds.comparisonIds.length)} />
                <MetricCard label="Suggestions" value={String(selectedExperiment.artifactIds.suggestionIds.length)} />
              </div>
              <label className="stack compact-stack">
                <span>Arm name</span>
                <input
                  aria-label="Experiment arm name"
                  className="input"
                  placeholder="Candidate with stricter bounded-break rubric"
                  value={experimentArmForm.name}
                  onChange={(event) => setExperimentArmForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="stack compact-stack">
                <span>Arm kind</span>
                <select
                  aria-label="Experiment arm kind"
                  className="select"
                  value={experimentArmForm.kind}
                  onChange={(event) =>
                    setExperimentArmForm((current) => ({
                      ...current,
                      kind: event.target.value as ExperimentArmFormState["kind"]
                    }))
                  }
                >
                  <option value="baseline">Baseline</option>
                  <option value="current_prompt">Current prompt</option>
                  <option value="candidate_prompt">Candidate prompt</option>
                  <option value="variant">Variant</option>
                </select>
              </label>
              <label className="stack compact-stack">
                <span>Arm candidate</span>
                <select
                  aria-label="Experiment arm candidate"
                  className="select"
                  value={experimentArmForm.promptCandidateId}
                  onChange={(event) => setExperimentArmForm((current) => ({ ...current, promptCandidateId: event.target.value }))}
                >
                  <option value="">No candidate</option>
                  {promptCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stack compact-stack">
                <span>Arm run</span>
                <select
                  aria-label="Experiment arm run"
                  className="select"
                  value={experimentArmForm.runId}
                  onChange={(event) => setExperimentArmForm((current) => ({ ...current, runId: event.target.value }))}
                >
                  <option value="">No run</option>
                  {runs.map((summary) => (
                    <option key={summary.run.id} value={summary.run.id}>
                      {formatDate(summary.run.createdAt)} · {formatPercent(summary.run.metrics.passRate)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stack compact-stack">
                <span>Arm notes</span>
                <textarea
                  aria-label="Experiment arm notes"
                  className="textarea"
                  placeholder="What hypothesis does this arm test?"
                  value={experimentArmForm.notes}
                  onChange={(event) => setExperimentArmForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
              <button className="btn btn-ghost" disabled={experimentArmForm.name.trim().length === 0} onClick={onAddExperimentArm}>
                <Plus size={16} /> Add Arm
              </button>
              {(selectedExperiment.arms ?? []).length > 0 && (
                <div className="release-decision-history">
                  {selectedExperiment.arms.map((arm) => (
                    <div className="release-decision-entry" key={arm.id}>
                      <strong>{arm.name}</strong>
                      <span>{formatTag(arm.kind)}</span>
                      {arm.notes && <small>{arm.notes}</small>}
                    </div>
                  ))}
                </div>
              )}
              <div className="row wrap-row">
                <button className="btn btn-ghost" disabled={!selectedRun} onClick={() => onLinkExperimentArtifact("run", selectedRun?.run.id)}>
                  Link Run
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!selectedPromptComparison}
                  onClick={() => onLinkExperimentArtifact("comparison", selectedPromptComparison?.id)}
                >
                  Link A/B
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!selectedComparisonSuggestion}
                  onClick={() => onLinkExperimentArtifact("suggestion", selectedComparisonSuggestion?.id)}
                >
                  Link Suggestions
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!latestReleaseDecision}
                  onClick={() => onLinkExperimentArtifact("release_decision", latestReleaseDecision?.id)}
                >
                  Link Release
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!selectedComparisonPromotion}
                  onClick={() => onLinkExperimentArtifact("promotion", selectedComparisonPromotion?.id)}
                >
                  Link Promotion
                </button>
              </div>
            </>
          )}
        </section>

        <div className="eval-form-grid">
          <label className="stack compact-stack">
            <span>Provider</span>
            <select
              aria-label="Experiment provider"
              className="select"
              value={form.provider}
              onChange={(event) => {
                const provider = event.target.value as ExperimentFormState["provider"];
                const providerConfig = provider === "mock" ? null : PROVIDERS.find((item) => item.id === provider);
                setForm((current) => ({
                  ...current,
                  provider,
                  model: provider === "mock" ? "mock" : providerConfig?.defaultModel ?? current.model
                }));
              }}
            >
              <option value="mock">Mock</option>
              {PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Model</span>
            <select
              aria-label="Experiment model"
              className="select"
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Mode</span>
            <select
              aria-label="Experiment mode"
              className="select"
              value={form.mode}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  mode: event.target.value as AICheckEvalRunMode
                }))
              }
            >
              <option value="tuning">Tuning</option>
              <option value="release_review">Release review</option>
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Dataset</span>
            <select
              aria-label="Experiment dataset"
              className="select"
              value={form.datasetType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  datasetType: event.target.value as ExperimentFormState["datasetType"]
                }))
              }
            >
              <option value="all">All datasets</option>
              {DATASET_TYPES.map((datasetType) => (
                <option key={datasetType} value={datasetType}>
                  {formatTag(datasetType)}
                </option>
              ))}
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Status</span>
            <select
              aria-label="Experiment status"
              className="select"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value as ExperimentFormState["status"] }))
              }
            >
              <option value="all">All statuses</option>
              {EVAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Strictness</span>
            <select
              aria-label="Experiment strictness"
              className="select"
              value={form.strictness}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  strictness: event.target.value as ExperimentFormState["strictness"]
                }))
              }
            >
              <option value="all">All strictness</option>
              {AI_CHECK_STRICTNESS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Expected</span>
            <select
              aria-label="Experiment expected decision"
              className="select"
              value={form.expectedDecision}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expectedDecision: event.target.value as ExperimentFormState["expectedDecision"]
                }))
              }
            >
              <option value="all">All decisions</option>
              {AI_CHECK_DECISIONS.map((decision) => (
                <option key={decision} value={decision}>
                  {formatDecision(decision)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="stack compact-stack">
          <span>Tag</span>
          <select
            aria-label="Experiment tag"
            className="select"
            value={form.tag}
            onChange={(event) => setForm((current) => ({ ...current, tag: event.target.value }))}
          >
            <option value="all">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {formatTag(tag)}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-row">
          <input
            checked={form.includeArchived}
            onChange={(event) => setForm((current) => ({ ...current, includeArchived: event.target.checked }))}
            type="checkbox"
          />
          <span>Include archived cases</span>
        </label>
        <p className="muted">
          Tuning mode hides Holdout failure details. Use release review only when making a release decision.
        </p>
        {!providerReady && (
          <p className="badge badge-warn">Save a {selectedProviderConfig?.label ?? "provider"} key in Settings before provider-mode runs.</p>
        )}

        <div className="row space-between">
          <span className="muted">{matchingCaseCount} matching cases</span>
          <button className="btn btn-primary" disabled={running || matchingCaseCount === 0 || !providerReady} onClick={onRun}>
            <FlaskConical size={16} /> {running ? "Running..." : "Run Eval"}
          </button>
        </div>

        <section className="stack compact-stack">
          <span className="section-label">CLI artifact</span>
          <textarea
            aria-label="Eval run artifact JSON"
            className="textarea"
            placeholder="Paste JSON from npm --workspace apps/extension run eval:ai-check -- --output=..."
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
          />
          <button className="btn btn-ghost" disabled={importing || importText.trim().length === 0} onClick={onImportRun}>
            <Upload size={16} /> {importing ? "Importing..." : "Import Run"}
          </button>
        </section>

        <section className="stack compact-stack">
          <span className="section-label">Candidate Prompt A/B</span>
          <label className="stack compact-stack">
            <span>Candidate</span>
            <select
              aria-label="Prompt candidate"
              className="select"
              value={selectedPromptCandidate?.id ?? ""}
              onChange={(event) => setSelectedPromptCandidateId(event.target.value)}
            >
              <option value="">No candidate selected</option>
              {promptCandidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack compact-stack">
            <span>Name</span>
            <input
              aria-label="Prompt candidate name"
              className="input"
              placeholder="Stricter bounded-purpose policy"
              value={promptCandidateForm.name}
              onChange={(event) => setPromptCandidateForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="stack compact-stack">
            <span>Patch</span>
            <textarea
              aria-label="Prompt candidate patch"
              className="textarea"
              placeholder="Additional instruction for this candidate arm"
              value={promptCandidateForm.instructionPatch}
              onChange={(event) =>
                setPromptCandidateForm((current) => ({ ...current, instructionPatch: event.target.value }))
              }
            />
          </label>
          <label className="stack compact-stack">
            <span>Rationale</span>
            <textarea
              aria-label="Prompt candidate rationale"
              className="textarea"
              placeholder="Which failure pattern is this candidate trying to fix?"
              value={promptCandidateForm.rationale}
              onChange={(event) => setPromptCandidateForm((current) => ({ ...current, rationale: event.target.value }))}
            />
          </label>
          <div className="row wrap-row">
            <button
              className="btn btn-ghost"
              disabled={promptCandidateForm.instructionPatch.trim().length === 0}
              onClick={onCreatePromptCandidate}
            >
              <Save size={16} /> Save Candidate
            </button>
            <button
              className="btn btn-primary"
              disabled={
                runningPromptComparison ||
                !selectedPromptCandidate ||
                form.provider === "mock" ||
                !providerReady ||
                matchingCaseCount === 0
              }
              onClick={onRunPromptComparison}
            >
              <BarChart3 size={16} /> {runningPromptComparison ? "Comparing..." : "Run A/B"}
            </button>
          </div>
          {form.provider === "mock" && <p className="muted">Candidate A/B requires a BYOK provider.</p>}
        </section>
      </aside>

      <section className="panel experiment-results-panel stack">
        <div className="row space-between">
          <div className="section-heading">
            <span className="section-label">Run results</span>
            <h2>{selectedRun ? formatDate(selectedRun.run.createdAt) : "No runs yet"}</h2>
          </div>
          <button
            aria-label="Refresh experiment runs"
            className="icon-btn"
            disabled={loading}
            title="Refresh experiment runs"
            onClick={onRefresh}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {selectedRun ? (
          <>
            {selectedPromptComparison && (
              <PromptComparisonSummary
                comparison={selectedPromptComparison}
                candidates={promptCandidates}
                generatingPromptCandidate={generatingPromptCandidate}
                generatingPromptProgramSuggestions={generatingPromptProgramSuggestions}
                promptProgramSuggestions={promptProgramSuggestions}
                promotions={promptPromotions}
                promotionNote={promptPromotionNote}
                promoting={promotingPromptCandidate}
                reviewingSuggestionItemId={reviewingPromptProgramSuggestionItemId}
                onSelectBaselineRun={setSelectedRunId}
                onSelectCandidateRun={setSelectedRunId}
                onGenerateCandidate={onGeneratePromptCandidate}
                onGenerateSuggestions={onGeneratePromptProgramSuggestions}
                onPromote={onPromotePromptCandidate}
                onReviewSuggestionItem={onReviewPromptProgramSuggestionItem}
                setPromotionNote={setPromptPromotionNote}
              />
            )}
            <div className="metric-grid">
              <MetricCard label="Pass rate" value={formatPercent(selectedRun.run.metrics.passRate)} />
              <MetricCard label="Passed" value={`${selectedRun.run.metrics.passed}/${selectedRun.run.metrics.total}`} />
              <MetricCard label="False allow" value={String(selectedRun.run.metrics.falseAllowFailures)} />
              <MetricCard label="False block" value={String(selectedRun.run.metrics.falseBlockFailures)} />
              <MetricCard label="ASK_MORE recall" value={String(selectedRun.run.metrics.askMoreRecallFailures)} />
              <MetricCard label="Unsafe sensitive" value={String(selectedRun.run.metrics.unsafeSensitiveFailures)} />
            </div>

            <section className={`release-gate release-gate-${selectedRun.run.metrics.releaseGate.status}`}>
              <div>
                <span className="section-label">Release gate</span>
                <strong>{selectedRun.run.metrics.releaseGate.status.toUpperCase()}</strong>
              </div>
              <ul>
                {selectedRun.run.metrics.releaseGate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </section>

            <section className="release-decision-card stack">
              <div className="row space-between">
                <div>
                  <span className="section-label">Release decision</span>
                  <h3>{latestReleaseDecision ? formatReleaseDecision(latestReleaseDecision.decision) : "Not decided"}</h3>
                </div>
                {latestReleaseDecision && <span className="badge">{formatDate(latestReleaseDecision.createdAt)}</span>}
              </div>
              <textarea
                aria-label="Release decision note"
                className="textarea"
                placeholder="Why is this prompt program safe to approve, or why should release stay blocked?"
                value={releaseNote}
                onChange={(event) => setReleaseNote(event.target.value)}
              />
              <div className="row wrap-row">
                <button
                  className="btn btn-primary"
                  disabled={!canApproveSelectedRun}
                  onClick={() => onCreateReleaseDecision("approved")}
                >
                  Approve Prompt
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!selectedRun || savingReleaseDecision}
                  onClick={() => onCreateReleaseDecision("blocked")}
                >
                  Block Release
                </button>
              </div>
              {selectedRun.run.metrics.releaseGate.status === "fail" && (
                <p className="muted">Approval is disabled while the release gate is failing.</p>
              )}
              {releaseReviewRequiredForApproval && (
                <p className="muted">Approval requires a release review run when Holdout cases are included.</p>
              )}
              {selectedReleaseDecisions.length > 0 && (
                <div className="release-decision-history">
                  {selectedReleaseDecisions.map((decision) => (
                    <div className="release-decision-entry" key={decision.id}>
                      <strong>{formatReleaseDecision(decision.decision)}</strong>
                      <span>{formatDate(decision.createdAt)}</span>
                      {decision.note && <small>{decision.note}</small>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {holdoutDetailsHidden ? (
              <section className="holdout-guard stack">
                <span className="section-label">Holdout protected</span>
                <strong>Detailed Holdout failures are hidden in tuning mode.</strong>
                <span>
                  Aggregate metrics and the release gate remain visible. Switch to release review mode when you need
                  controlled failure summaries for a release decision.
                </span>
              </section>
            ) : (
              <>
                <div className="metric-breakdown-grid">
                  <MetricBreakdown title="By tag" rows={selectedRun.run.metrics.byTag} />
                  <MetricBreakdown title="By strictness" rows={selectedRun.run.metrics.byStrictness} />
                </div>

                <div className="stack compact-stack">
                  <span className="section-label">Failures</span>
                  {failedResults.length === 0 ? (
                    <p className="muted">No failed cases in this run.</p>
                  ) : (
                    <div className="eval-case-list">
                      {failedResults.map((result) => {
                        const evalCase = caseById.get(result.evalCaseId);
                        return (
                          <div className="eval-case-item" key={result.id}>
                            <div className="row space-between">
                              <strong>{evalCase?.title ?? result.evalCaseId}</strong>
                              <span>{formatDecision(result.actualDecision)}</span>
                            </div>
                            <small>{result.failureReasons.join("; ")}</small>
                            {evalCase && <TagList tags={evalCase.eval?.tags ?? []} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="empty-state">
            <BarChart3 size={28} />
            <strong>Run an experiment</strong>
            <span>Current Prompt Program eval results will be saved locally.</span>
          </div>
        )}
      </section>

      <aside className="panel experiment-run-list stack">
        <div className="section-heading">
          <span className="section-label">Experiment history</span>
          <h2>Workspaces</h2>
        </div>
        {experiments.length === 0 ? (
          <p className="muted">No experiment workspaces yet.</p>
        ) : (
          experiments.map((experiment) => (
            <button
              className={experiment.id === selectedExperiment?.id ? "eval-case-item eval-case-item-selected" : "eval-case-item"}
              key={experiment.id}
              onClick={() => setSelectedExperimentId(experiment.id)}
            >
              <strong>{experiment.name}</strong>
              <span>{formatStatusLabel(experiment.status)}</span>
              <small>
                {(experiment.arms ?? []).length} arms · {experiment.artifactIds.runIds.length} runs · {experiment.artifactIds.comparisonIds.length} comparisons ·{" "}
                {experiment.artifactIds.suggestionIds.length} suggestions
              </small>
            </button>
          ))
        )}
        <div className="section-heading">
          <span className="section-label">Run history</span>
          <h2>Local runs</h2>
        </div>
        {runs.length === 0 ? (
          <p className="muted">No experiment runs saved yet.</p>
        ) : (
          runs.map((summary) => (
            <button
              className={
                summary.run.id === selectedRun?.run.id ? "eval-case-item eval-case-item-selected" : "eval-case-item"
              }
              key={summary.run.id}
              onClick={() => setSelectedRunId(summary.run.id)}
            >
              <strong>{formatDate(summary.run.createdAt)}</strong>
              <span>{formatPercent(summary.run.metrics.passRate)} pass</span>
              <small>
                {summary.run.caseIds.length} cases · {formatProvider(summary.run.provider)} · {summary.run.model} ·{" "}
                {formatRunMode(summary.run.mode)} · {formatRunFilter(summary.run.filters)}
              </small>
            </button>
          ))
        )}
        <div className="section-heading">
          <span className="section-label">A/B history</span>
          <h2>Comparisons</h2>
        </div>
        {promptComparisons.length === 0 ? (
          <p className="muted">No candidate comparisons yet.</p>
        ) : (
          promptComparisons.map((comparison) => (
            <button
              className={
                comparison.id === selectedPromptComparison?.id ? "eval-case-item eval-case-item-selected" : "eval-case-item"
              }
              key={comparison.id}
              onClick={() => {
                setSelectedPromptComparisonId(comparison.id);
                setSelectedRunId(comparison.candidateRunId);
              }}
            >
              <strong>{formatRecommendation(comparison.recommendation)}</strong>
              <span>
                {formatPercent(comparison.baselineMetrics.passRate)} to {formatPercent(comparison.candidateMetrics.passRate)}
              </span>
              <small>
                {comparison.improvedCaseIds.length} improved · {comparison.regressedCaseIds.length} regressed ·{" "}
                {formatDate(comparison.createdAt)}
              </small>
            </button>
          ))
        )}
      </aside>
    </section>
  );
}

function PromptComparisonSummary({
  candidates,
  comparison,
  generatingPromptCandidate,
  generatingPromptProgramSuggestions,
  promptProgramSuggestions,
  promotions,
  promotionNote,
  promoting,
  reviewingSuggestionItemId,
  onSelectBaselineRun,
  onSelectCandidateRun,
  onGenerateCandidate,
  onGenerateSuggestions,
  onPromote,
  onReviewSuggestionItem,
  setPromotionNote
}: {
  candidates: AICheckPromptCandidate[];
  comparison: AICheckPromptComparison;
  generatingPromptCandidate: boolean;
  generatingPromptProgramSuggestions: boolean;
  promptProgramSuggestions: AICheckPromptProgramSuggestion[];
  promotions: AICheckPromptPromotion[];
  promotionNote: string;
  promoting: boolean;
  reviewingSuggestionItemId: string | null;
  onSelectBaselineRun: (runId: string) => void;
  onSelectCandidateRun: (runId: string) => void;
  onGenerateCandidate: () => void;
  onGenerateSuggestions: () => void;
  onPromote: () => void;
  onReviewSuggestionItem: (input: ReviewPromptProgramSuggestionItemInput) => void;
  setPromotionNote: (value: string) => void;
}) {
  const candidate = candidates.find((item) => item.id === comparison.candidateId);
  const promotion = promotions.find((item) => item.comparisonId === comparison.id) ?? null;
  const comparisonSuggestions = promptProgramSuggestions.filter((item) => item.comparisonId === comparison.id);
  const canPromote =
    comparison.recommendation === "promote_candidate" &&
    comparison.regressedCaseIds.length === 0 &&
    comparison.candidateMetrics.releaseGate.status !== "fail" &&
    comparison.promotionGate.status === "pass" &&
    !promotion &&
    !promoting;
  return (
    <section className="release-decision-card stack">
      <div className="row space-between">
        <div>
          <span className="section-label">Candidate Prompt A/B</span>
          <h3>{candidate?.name ?? comparison.candidateId}</h3>
        </div>
        <span className="badge">{formatRecommendation(comparison.recommendation)}</span>
      </div>
      <div className="metric-grid">
        <MetricCard label="Baseline" value={formatPercent(comparison.baselineMetrics.passRate)} />
        <MetricCard label="Candidate" value={formatPercent(comparison.candidateMetrics.passRate)} />
        <MetricCard label="Improved" value={String(comparison.improvedCaseIds.length)} />
        <MetricCard label="Regressed" value={String(comparison.regressedCaseIds.length)} />
      </div>
      <div className="row wrap-row">
        <button className="btn btn-ghost" onClick={() => onSelectBaselineRun(comparison.baselineRunId)}>
          Baseline Run
        </button>
        <button className="btn btn-ghost" onClick={() => onSelectCandidateRun(comparison.candidateRunId)}>
          Candidate Run
        </button>
        <button className="btn btn-ghost" disabled={generatingPromptCandidate} onClick={onGenerateCandidate}>
          {generatingPromptCandidate ? "Generating..." : "Generate Candidate"}
        </button>
        <button className="btn btn-ghost" disabled={generatingPromptProgramSuggestions} onClick={onGenerateSuggestions}>
          {generatingPromptProgramSuggestions ? "Generating..." : "Generate Suggestions"}
        </button>
      </div>
      <section className="stack compact-stack">
        <span className="section-label">Promotion</span>
        <div className={`release-gate release-gate-${comparison.promotionGate.status}`}>
          <div>
            <span className="section-label">Promotion gate</span>
            <strong>{comparison.promotionGate.status.toUpperCase()}</strong>
          </div>
          <ul>
            {comparison.promotionGate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="metric-grid">
          {comparison.promotionGate.datasetCoverage.map((row) => (
            <MetricCard key={row.datasetType} label={formatTag(row.datasetType)} value={`${row.passed}/${row.total}`} />
          ))}
        </div>
        {promotion ? (
          <div className="release-decision-entry">
            <strong>{promotion.promptVersion}</strong>
            <span>{formatDate(promotion.createdAt)}</span>
            {promotion.note && <small>{promotion.note}</small>}
          </div>
        ) : (
          <>
            <textarea
              aria-label="Prompt promotion note"
              className="textarea"
              placeholder="Why should this candidate become the active local Prompt Program?"
              value={promotionNote}
              onChange={(event) => setPromotionNote(event.target.value)}
            />
            <button className="btn btn-primary" disabled={!canPromote} onClick={onPromote}>
              Promote Candidate
            </button>
            {!canPromote && (
              <p className="muted">
                Promotion requires a promote recommendation, no regressions, a passing candidate gate, and Design/Regression/Holdout
                coverage.
              </p>
            )}
          </>
        )}
      </section>
      <section className="stack compact-stack">
        <span className="section-label">Textual Gradient</span>
        <strong>{comparison.textualGradient.summary}</strong>
        {comparison.textualGradient.failureClusters.length > 0 && (
          <div className="metric-breakdown-grid">
            {comparison.textualGradient.failureClusters.slice(0, 4).map((cluster) => (
              <section className="metric-breakdown stack" key={cluster.label}>
                <span className="section-label">{formatTag(cluster.label)}</span>
                <strong>{cluster.cases} cases</strong>
                <span>{cluster.direction}</span>
              </section>
            ))}
          </div>
        )}
        <ul>
          {comparison.textualGradient.suggestedPromptDirections.map((direction) => (
            <li key={direction}>{direction}</li>
          ))}
        </ul>
        <div className="release-decision-history">
          {comparison.textualGradient.riskNotes.map((note) => (
            <div className="release-decision-entry" key={note}>
              <span>{note}</span>
            </div>
          ))}
        </div>
      </section>
      {comparisonSuggestions.length > 0 && (
        <section className="stack compact-stack">
          <span className="section-label">Prompt Program Suggestions</span>
          <div className="release-decision-history">
            {comparisonSuggestions.map((suggestion) => (
              <div className="release-decision-entry" key={suggestion.id}>
                <strong>{formatDate(suggestion.createdAt)}</strong>
                <span>
                  {formatProvider(suggestion.provider)} · {suggestion.model} · {suggestion.items.length} items
                </span>
                <div className="metric-breakdown-grid">
                  {suggestion.items.map((item) => (
                    <section className="metric-breakdown stack" key={`${suggestion.id}-${item.kind}-${item.title}`}>
                      <span className="section-label">{formatTag(item.kind)}</span>
                      <div className="row space-between">
                        <strong>{item.title}</strong>
                        <span className={`status-pill status-pill-${item.status}`}>{formatStatusLabel(item.status)}</span>
                      </div>
                      <span>{item.suggestion}</span>
                      {item.rationale && <small>{item.rationale}</small>}
                      {item.implementationNotes && <small>{item.implementationNotes}</small>}
                      {item.risk && <small>{item.risk}</small>}
                      {item.reviewNote && <small>{item.reviewNote}</small>}
                      {item.reviewedAt && <small>{formatDate(item.reviewedAt)}</small>}
                      <div className="row wrap-row">
                        <button
                          aria-label={`Accept suggestion ${item.title}`}
                          className="btn btn-ghost"
                          disabled={reviewingSuggestionItemId === item.id || item.status === "accepted"}
                          onClick={() =>
                            onReviewSuggestionItem({
                              suggestionId: suggestion.id,
                              itemId: item.id,
                              status: "accepted",
                              reviewNote: "Accepted for contract-first implementation."
                            })
                          }
                        >
                          Accept
                        </button>
                        <button
                          aria-label={`Reject suggestion ${item.title}`}
                          className="btn btn-ghost"
                          disabled={reviewingSuggestionItemId === item.id || item.status === "rejected"}
                          onClick={() =>
                            onReviewSuggestionItem({
                              suggestionId: suggestion.id,
                              itemId: item.id,
                              status: "rejected",
                              reviewNote: "Rejected during PM review."
                            })
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricBreakdown({ rows, title }: { rows: AICheckEvalRunSummary["run"]["metrics"]["byTag"]; title: string }) {
  return (
    <section className="metric-breakdown stack">
      <span className="section-label">{title}</span>
      {rows.length === 0 ? (
        <p className="muted">No breakdown.</p>
      ) : (
        rows.slice(0, 8).map((row) => (
          <div className="row space-between" key={row.key}>
            <span>{formatTag(row.key)}</span>
            <strong>
              {row.passed}/{row.total}
            </strong>
          </div>
        ))
      )}
    </section>
  );
}

function HistoryCases({
  errorTypes,
  expectedDecision,
  reviewerNote,
  saving,
  selected,
  selectedBadCase,
  selectedDecisionId,
  sessionsLoading,
  sessions,
  setErrorTypes,
  setExpectedDecision,
  setSelectedDecisionId,
  setReviewerNote,
  setSelectedSessionId,
  onConvert,
  onRefresh,
  onSave
}: {
  errorTypes: BadCaseErrorType[];
  expectedDecision: AIDecision | "";
  reviewerNote: string;
  saving: boolean;
  selected: AIPMReviewSession | null;
  selectedBadCase: BadCaseReview | null;
  selectedDecisionId: string | null;
  sessionsLoading: boolean;
  sessions: AIPMReviewSession[];
  setErrorTypes: (value: BadCaseErrorType[] | ((current: BadCaseErrorType[]) => BadCaseErrorType[])) => void;
  setExpectedDecision: (value: AIDecision | "") => void;
  setSelectedDecisionId: (value: string) => void;
  setReviewerNote: (value: string) => void;
  setSelectedSessionId: (value: string) => void;
  onConvert: () => void;
  onRefresh: () => void;
  onSave: () => void;
}) {
  const selectedDecision =
    selected?.decisions.find((decision) => decision.id === selectedDecisionId) ?? selected?.decisions.at(-1) ?? null;
  const selectedDecisionPointSource = selectedDecision ? selected?.decisionPointSources?.[selectedDecision.id] ?? "derived" : null;

  return (
    <section className="review-layout">
      <aside className="panel review-session-list stack">
        <div className="row space-between">
          <div className="section-heading">
            <span className="section-label">History Cases</span>
            <h2>Recent AI Checks</h2>
          </div>
          <button
            aria-label="Refresh history cases"
            className="icon-btn"
            disabled={sessionsLoading}
            title="Refresh history cases"
            onClick={onRefresh}
          >
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
                <StatusItem label="Actual" value={formatDecision(selectedDecision?.decision ?? null)} />
                <StatusItem label="Turns" value={`${selected.session.assistantTurnCount}/${selected.session.maxAssistantTurns}`} />
                <StatusItem label="Snapshot Source" value={formatSnapshotSource(selectedDecisionPointSource)} />
              </div>
            </div>

            {selected.decisions.length > 0 && (
              <div className="stack compact-stack">
                <span className="section-label">Decision points</span>
                <div className="row wrap-row">
                  {selected.decisions.map((decision, index) => (
                    <button
                      className={decision.id === selectedDecision?.id ? "btn btn-primary" : "btn"}
                      key={decision.id}
                      onClick={() => setSelectedDecisionId(decision.id)}
                    >
                      Turn {index + 1}: {formatDecision(decision.decision)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="review-transcript" aria-label="AI Check transcript">
              {selected.messages.map((message) => (
                <div className={message.role === "user" ? "message message-user" : "message message-assistant"} key={message.id}>
                  {message.content}
                </div>
              ))}
            </div>

            {selectedDecision && (
              <>
                {selectedDecision.rawProvider && (
                  <details className="review-json">
                    <summary>Model Output JSON</summary>
                    <pre className="code">{formatProviderJson(selectedDecision.rawProvider)}</pre>
                  </details>
                )}
                <details className="review-json">
                  <summary>Stored Decision Record</summary>
                  <pre className="code">{JSON.stringify(selectedDecision, null, 2)}</pre>
                </details>
              </>
            )}

            <div className="review-form stack">
              <div className="section-heading">
                <span className="section-label">PM judgment</span>
                <h2>{selectedBadCase ? "Update bad case" : "Mark as bad case"}</h2>
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
                  disabled={saving || !selectedBadCase || Boolean(selectedBadCase.convertedEvalCaseId)}
                  onClick={onConvert}
                >
                  {selectedBadCase?.convertedEvalCaseId ? <CheckCircle2 size={16} /> : <FlaskConical size={16} />}
                  {selectedBadCase?.convertedEvalCaseId ? "Eval Case Created" : "Convert to Eval Case"}
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

      {!creating && evalCase && (
        <div className="row wrap-row">
          <span className="badge">{formatCaseProvenance(evalCase.provenance.type)}</span>
          {isBuiltInEvalCase(evalCase) && <span className="badge badge-warn">Built-in default</span>}
          {evalCase.provenance.type === "review" && evalCase.provenance.reviewId && (
            <span className="badge">Review linked</span>
          )}
        </div>
      )}
      {!creating && evalCase && isBuiltInEvalCase(evalCase) && (
        <p className="muted">
          Built-in defaults are contract fixtures. Edits or archives are stored as local overrides instead of changing the
          bundled fixture source.
        </p>
      )}

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
          <span>Dataset</span>
          <select
            className="select"
            value={form.datasetType}
            onChange={(event) =>
              setForm((current) => ({ ...current, datasetType: event.target.value as AICheckCase["datasetType"] }))
            }
          >
            {DATASET_TYPES.map((datasetType) => (
              <option key={datasetType} value={datasetType}>
                {formatTag(datasetType)}
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
          <span>Message must mention</span>
          <input
            className="input"
            value={form.userFacingMustMention}
            onChange={(event) => setForm((current) => ({ ...current, userFacingMustMention: event.target.value }))}
            placeholder="time limit, exit plan"
          />
        </label>
        <label className="stack compact-stack">
          <span>Message must not mention</span>
          <input
            className="input"
            value={form.userFacingMustNotMention}
            onChange={(event) => setForm((current) => ({ ...current, userFacingMustNotMention: event.target.value }))}
            placeholder="You are weak"
          />
        </label>
      </div>
      <div className="eval-form-grid">
        <label className="stack compact-stack">
          <span>Input has explicit duration</span>
          <select
            aria-label="Expected explicit duration evidence"
            className="select"
            value={form.hasExplicitDuration}
            onChange={(event) =>
              setForm((current) => ({ ...current, hasExplicitDuration: event.target.value as EvidenceExpectationValue }))
            }
          >
            <option value="ignore">Ignore</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label className="stack compact-stack">
          <span>Input has return plan</span>
          <select
            aria-label="Expected return plan evidence"
            className="select"
            value={form.hasReturnPlan}
            onChange={(event) =>
              setForm((current) => ({ ...current, hasReturnPlan: event.target.value as EvidenceExpectationValue }))
            }
          >
            <option value="ignore">Ignore</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
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

function SchemaReference({
  contractChangePlanNotes,
  contractChangePlans,
  creatingContractChangePlanItemId,
  onCreateContractChangePlan,
  onSetContractChangePlanNote,
  onUpdateContractChangePlan,
  promptProgramSuggestions,
  updatingContractChangePlanId
}: {
  contractChangePlanNotes: Record<string, string>;
  contractChangePlans: AICheckContractChangePlan[];
  creatingContractChangePlanItemId: string | null;
  onCreateContractChangePlan: (input: CreateContractChangePlanInput) => void;
  onSetContractChangePlanNote: (planId: string, note: string) => void;
  onUpdateContractChangePlan: (input: UpdateContractChangePlanInput) => void;
  promptProgramSuggestions: AICheckPromptProgramSuggestion[];
  updatingContractChangePlanId: string | null;
}) {
  const [activeTab, setActiveTab] = useState<SchemaManualTab>("messages");
  const [selectedOutputSchemaVersion, setSelectedOutputSchemaVersion] = useState(
    AI_CHECK_CURRENT_VERSIONS.outputSchemaVersion
  );
  const [selectedEvaluationSchemaVersion, setSelectedEvaluationSchemaVersion] = useState(
    AI_CHECK_CURRENT_VERSIONS.evaluationSchemaVersion
  );
  const selectedOutputSchema =
    AI_CHECK_OUTPUT_SCHEMA_VERSIONS.find((entry) => entry.version === selectedOutputSchemaVersion) ??
    AI_CHECK_OUTPUT_SCHEMA_VERSIONS.find((entry) => entry.current) ??
    AI_CHECK_OUTPUT_SCHEMA_VERSIONS[0];
  const selectedEvaluationSchema =
    AI_CHECK_EVALUATION_SCHEMA_VERSIONS.find((entry) => entry.version === selectedEvaluationSchemaVersion) ??
    AI_CHECK_EVALUATION_SCHEMA_VERSIONS.find((entry) => entry.current) ??
    AI_CHECK_EVALUATION_SCHEMA_VERSIONS[0];

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
          <VersionPicker
            label="Prompt"
            value={AI_CHECK_CURRENT_VERSIONS.promptVersion}
            options={AI_CHECK_PROMPT_VERSIONS}
            source="AI_CHECK_CONTRACT.current.promptVersion"
          />
          <VersionPicker
            label="Output Schema"
            value={selectedOutputSchema?.version ?? AI_CHECK_CURRENT_VERSIONS.outputSchemaVersion}
            options={AI_CHECK_OUTPUT_SCHEMA_VERSIONS}
            source="AI_CHECK_CONTRACT.versionRegistry.outputSchemas"
            onChange={setSelectedOutputSchemaVersion}
          />
          <VersionPicker
            label="Evaluation Schema"
            value={selectedEvaluationSchema?.version ?? AI_CHECK_CURRENT_VERSIONS.evaluationSchemaVersion}
            options={AI_CHECK_EVALUATION_SCHEMA_VERSIONS}
            source="AI_CHECK_CONTRACT.versionRegistry.evaluationSchemas"
            onChange={setSelectedEvaluationSchemaVersion}
          />
          <VersionChip
            label="Session"
            value={`${AI_CHECK_CONTRACT.sessionPolicy.maxAssistantTurns} turns / ${AI_CHECK_CONTRACT.sessionPolicy.maxSessionSeconds}s`}
            source="AI_CHECK_CONTRACT.sessionPolicy"
          />
        </div>
      </div>

      <ContractSuggestionBacklog
        contractChangePlanNotes={contractChangePlanNotes}
        contractChangePlans={contractChangePlans}
        creatingContractChangePlanItemId={creatingContractChangePlanItemId}
        onCreateContractChangePlan={onCreateContractChangePlan}
        onSetContractChangePlanNote={onSetContractChangePlanNote}
        onUpdateContractChangePlan={onUpdateContractChangePlan}
        promptProgramSuggestions={promptProgramSuggestions}
        updatingContractChangePlanId={updatingContractChangePlanId}
      />

      <div className="schema-manual-tabs" role="tablist" aria-label="Schema reference views">
        {(["messages", "rubric", "output", "evaluation"] as SchemaManualTab[]).map((tab) => (
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
      {activeTab === "rubric" && <PromptProgramReference />}
      {activeTab === "output" && (
        <SchemaSectionReference
          kind="output"
          section={selectedOutputSchema?.section ?? AI_CHECK_CONTRACT.sections.output}
          version={selectedOutputSchema?.version ?? AI_CHECK_CURRENT_VERSIONS.outputSchemaVersion}
        />
      )}
      {activeTab === "evaluation" && (
        <SchemaSectionReference
          kind="evaluation"
          section={selectedEvaluationSchema?.section ?? AI_CHECK_CONTRACT.sections.evaluation}
          version={selectedEvaluationSchema?.version ?? AI_CHECK_CURRENT_VERSIONS.evaluationSchemaVersion}
        />
      )}
    </section>
  );
}

function VersionPicker({
  label,
  onChange,
  options,
  source,
  value
}: {
  label: string;
  onChange?: (value: string) => void;
  options: Array<{ version: string; label: string; current?: boolean }>;
  source: string;
  value: string;
}) {
  return (
    <label className="contract-version-chip contract-version-picker">
      <span>{label}</span>
      <select
        aria-label={`${label} version`}
        disabled={!onChange || options.length <= 1}
        onChange={(event) => onChange?.(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.version} value={option.version}>
            {option.label}
            {option.current ? " (current)" : ""}
          </option>
        ))}
      </select>
      <code>{source}</code>
    </label>
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

function ContractSuggestionBacklog({
  contractChangePlanNotes,
  contractChangePlans,
  creatingContractChangePlanItemId,
  onCreateContractChangePlan,
  onSetContractChangePlanNote,
  onUpdateContractChangePlan,
  promptProgramSuggestions,
  updatingContractChangePlanId
}: {
  contractChangePlanNotes: Record<string, string>;
  contractChangePlans: AICheckContractChangePlan[];
  creatingContractChangePlanItemId: string | null;
  onCreateContractChangePlan: (input: CreateContractChangePlanInput) => void;
  onSetContractChangePlanNote: (planId: string, note: string) => void;
  onUpdateContractChangePlan: (input: UpdateContractChangePlanInput) => void;
  promptProgramSuggestions: AICheckPromptProgramSuggestion[];
  updatingContractChangePlanId: string | null;
}) {
  const acceptedItems = promptProgramSuggestions.flatMap((suggestion) =>
    suggestion.items
      .filter((item) => item.status === "accepted")
      .map((item) => ({
        plan: contractChangePlans.find(
          (candidate) => candidate.suggestionId === suggestion.id && candidate.suggestionItemId === item.id
        ),
        item,
        suggestion
      }))
  );

  return (
    <section className="panel stack">
      <div className="section-heading">
        <span className="section-label">Contract-first backlog</span>
        <h2>{acceptedItems.length === 0 ? "No accepted suggestions" : `${acceptedItems.length} accepted suggestions`}</h2>
      </div>
      <p className="muted">
        Accepted Prompt Program Suggestions are implementation inputs only. Apply them by changing the contract source,
        regenerated references, eval assertions, and linked docs in one explicit change.
      </p>
      {acceptedItems.length > 0 && (
        <div className="metric-breakdown-grid">
          {acceptedItems.map(({ item, plan, suggestion }) => (
            <section className="metric-breakdown stack" key={`${suggestion.id}-${item.id}`}>
              <span className="section-label">{formatTag(item.kind)}</span>
              <strong>{item.title}</strong>
              <span>{item.suggestion}</span>
              {item.implementationNotes && <small>{item.implementationNotes}</small>}
              {item.risk && <small>{item.risk}</small>}
              {item.reviewNote && <small>{item.reviewNote}</small>}
              {plan ? (
                <div className="stack">
                  <span className="badge badge-success">Plan {formatTag(plan.status)}</span>
                  <small>{plan.targets.map(formatTag).join(" + ")}</small>
                  {plan.requiredSurfaces.map((surface) => (
                    <small key={surface}>{surface}</small>
                  ))}
                  {plan.appliedVersions && (
                    <small>
                      Applied against {plan.appliedVersions.promptVersion} / {plan.appliedVersions.outputSchemaVersion} /{" "}
                      {plan.appliedVersions.evaluationSchemaVersion}
                    </small>
                  )}
                  <textarea
                    aria-label={`Contract plan note for ${plan.title}`}
                    className="textarea"
                    onChange={(event) => onSetContractChangePlanNote(plan.id, event.target.value)}
                    placeholder="Implementation note, validation evidence, or rejection reason"
                    rows={3}
                    value={contractChangePlanNotes[plan.id] ?? plan.implementationNote ?? ""}
                  />
                  <div className="schema-manual-tabs">
                    <button
                      className="btn btn-ghost"
                      disabled={updatingContractChangePlanId === plan.id || plan.status === "ready"}
                      onClick={() =>
                        onUpdateContractChangePlan({
                          id: plan.id,
                          status: "ready",
                          implementationNote: contractChangePlanNotes[plan.id]
                        })
                      }
                    >
                      Mark Ready
                    </button>
                    <button
                      className="btn btn-primary"
                      disabled={updatingContractChangePlanId === plan.id || plan.status === "applied"}
                      onClick={() =>
                        onUpdateContractChangePlan({
                          id: plan.id,
                          status: "applied",
                          implementationNote: contractChangePlanNotes[plan.id]
                        })
                      }
                    >
                      Mark Applied
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={updatingContractChangePlanId === plan.id || plan.status === "rejected"}
                      onClick={() =>
                        onUpdateContractChangePlan({
                          id: plan.id,
                          status: "rejected",
                          implementationNote: contractChangePlanNotes[plan.id]
                        })
                      }
                    >
                      Reject Plan
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  aria-label={`Create plan for ${item.title}`}
                  className="btn btn-ghost"
                  disabled={creatingContractChangePlanItemId === item.id}
                  onClick={() =>
                    onCreateContractChangePlan({
                      suggestionId: suggestion.id,
                      itemId: item.id
                    })
                  }
                >
                  {creatingContractChangePlanItemId === item.id ? "Creating..." : "Create Plan"}
                </button>
              )}
              <code>{suggestion.comparisonId}</code>
            </section>
          ))}
        </div>
      )}
      <div className="schema-guidance stack">
        <StatusItem label="Contract source" value="Update apps/extension/src/shared/ai-check-contract.json first." />
        <StatusItem label="Generated surfaces" value="Run contract generation and keep PM Review references aligned." />
        <StatusItem label="Validation" value="Update eval assertions or fixtures, then run the AI Check contract and eval gates." />
      </div>
    </section>
  );
}

function PromptProgramReference() {
  return (
    <div className="schema-workspace schema-workspace-reference">
      <section className="panel schema-tree-panel schema-visual-panel stack">
        <div className="section-heading">
          <span className="section-label">Prompt Program Rubric</span>
          <h2>Decision Policy</h2>
        </div>
        <p className="muted">
          These rules come from `AI_CHECK_CONTRACT.promptProgram.decisionPolicyRules` and are injected into the system
          prompt as the decision policy block.
        </p>
        <div className="schema-guidance stack">
          {AI_CHECK_DECISION_POLICY_RULES.map((rule) => (
            <StatusItem key={rule.id} label={rule.label} value={rule.rule} />
          ))}
        </div>
      </section>

      <section className="panel schema-example-panel stack">
        <div className="section-heading">
          <span className="section-label">Prompt Program Rubric</span>
          <h2>Scoring Rules</h2>
        </div>
        <p className="muted">
          Scoring guidance is contract-backed so eval diagnostics and provider instructions use the same interpretation.
        </p>
        <div className="schema-guidance stack">
          {AI_CHECK_SCORING_RULES.map((rule) => (
            <StatusItem key={rule.id} label={rule.label} value={rule.rule} />
          ))}
        </div>
        <div className="contract-version-chip">
          <span>Source</span>
          <strong>{AI_CHECK_PROMPT_PROGRAM.decisionPolicyRules.length + AI_CHECK_PROMPT_PROGRAM.scoringRules.length} rules</strong>
          <code>AI_CHECK_CONTRACT.promptProgram</code>
        </div>
      </section>
    </div>
  );
}

function SchemaSectionReference({
  kind,
  section,
  version
}: {
  kind: "output" | "evaluation";
  section: SchemaManualSection;
  version: string;
}) {
  const schemaPreview = useMemo(() => buildSchemaPreview(kind, section), [kind, section]);
  const firstPath = useMemo(
    () => findFirstExampleFieldPath(section.example, section.fields) ?? section.fields[0]?.path ?? "",
    [section.example, section.fields]
  );
  const [selectedPath, setSelectedPath] = useState(firstPath);

  useEffect(() => {
    setSelectedPath(firstPath);
  }, [firstPath]);

  return (
    <div className="schema-workspace schema-workspace-reference">
      <section className="panel schema-tree-panel schema-visual-panel stack">
        <div className="section-heading">
          <span className="section-label">{formatSchemaManualTab(kind)} Schema</span>
          <h2>{section.title}</h2>
        </div>
        <p className="muted">{section.summary}</p>
        <SchemaExampleViewer
          badge={version}
          descriptor="schema"
          example={schemaPreview}
          fields={section.fields}
          label={section.title}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
        />
        {kind === "evaluation" && (
          <div className="schema-guidance stack">
            <StatusItem
              label="Evaluation Case"
              value="A saved eval fixture: model input, optional captured output, and expected-output checks."
            />
            <StatusItem
              label="Regression Dataset"
              value="Ready Evaluation Cases with datasetType = regression are used for release-gating checks."
            />
          </div>
        )}
      </section>

      <section className="panel schema-example-panel stack">
        <div className="section-heading">
          <span className="section-label">{formatSchemaManualTab(kind)} Example</span>
          <h2>{section.title}</h2>
        </div>
        <SchemaExampleViewer
          descriptor="example"
          example={section.example}
          fields={section.fields}
          label={section.title}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
        />
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
        Evaluation Case stores one replayable model test. Dataset type controls whether it is design, regression, or holdout.
      </p>
    </div>
  );
}

function SchemaExampleViewer({
  badge,
  descriptor = "example",
  example,
  fields,
  label,
  onSelect,
  selectedPath
}: {
  badge?: string;
  descriptor?: "example" | "schema";
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
        {badge && <span className="json-token-badge"> {badge}</span>}
        <span> {descriptor}</span>
      </div>
      <SchemaExampleValue
        descriptor={descriptor}
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
  descriptor,
  fieldMap,
  indent,
  onSelect,
  path,
  selectedPath,
  value,
  wrapped = true
}: {
  descriptor: "example" | "schema";
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
        {wrapped && <SchemaExampleLine content={<JsonPunctuation>[</JsonPunctuation>} indent={indent} />}
        {value.map((item, index) => (
          <SchemaExampleValue
            descriptor={descriptor}
            fieldMap={fieldMap}
            indent={wrapped ? indent + 1 : indent}
            key={`${path}-${index}`}
            onSelect={onSelect}
            path={`${path}.${index}`}
            selectedPath={selectedPath}
            value={item}
          />
        ))}
        {wrapped && <SchemaExampleLine content={<JsonPunctuation>]</JsonPunctuation>} indent={indent} />}
      </>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
  return (
      <>
        {wrapped && <SchemaExampleLine content={<JsonPunctuation>{"{"}</JsonPunctuation>} indent={indent} />}
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
                    content={
                      <>
                        <JsonKey name={key} />
                        <JsonPunctuation>: </JsonPunctuation>
                        <JsonPunctuation>{Array.isArray(childValue) ? "[" : "{"}</JsonPunctuation>
                      </>
                    }
                    field={field}
                    indent={indent + 1}
                    onSelect={onSelect}
                    path={childPath}
                    selected={selectedPath === childPath}
                  />
                  <SchemaExampleValue
                    descriptor={descriptor}
                    fieldMap={fieldMap}
                    indent={indent + 2}
                    onSelect={onSelect}
                    path={childPath}
                    selectedPath={selectedPath}
                    value={childValue}
                    wrapped={false}
                  />
                  <SchemaExampleLine
                    content={
                      <>
                        <JsonPunctuation>{Array.isArray(childValue) ? "]" : "}"}</JsonPunctuation>
                        {suffix && <JsonPunctuation>{suffix}</JsonPunctuation>}
                      </>
                    }
                    indent={indent + 1}
                  />
                </>
              ) : (
                <SchemaExampleLine
                  content={
                    <>
                      <JsonKey name={key} />
                      <JsonPunctuation>: </JsonPunctuation>
                      <JsonScalarToken descriptor={descriptor} value={childValue} />
                      {suffix && <JsonPunctuation>{suffix}</JsonPunctuation>}
                    </>
                  }
                  field={field}
                  indent={indent + 1}
                  onSelect={onSelect}
                  path={childPath}
                  selected={selectedPath === childPath}
                />
              )}
            </div>
          );
        })}
        {wrapped && <SchemaExampleLine content={<JsonPunctuation>{"}"}</JsonPunctuation>} indent={indent} />}
      </>
    );
  }

  return <SchemaExampleLine content={<JsonScalarToken descriptor={descriptor} value={value} />} indent={indent} />;
}

function SchemaExampleLine({
  content,
  field,
  indent,
  onSelect,
  path,
  selected
}: {
  content: ReactNode;
  field?: AICheckSchemaFieldReference;
  indent: number;
  onSelect?: (path: string) => void;
  path?: string;
  selected?: boolean;
}) {
  const lineContent = (
    <>
      <span className="schema-example-indent" style={{ "--schema-example-depth": indent } as CSSProperties} />
      <span className="json-line-content">{content}</span>
    </>
  );

  if (!field || !path || !onSelect) {
    return <span className="provider-code-line schema-example-code-line">{lineContent}</span>;
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
      {lineContent}
    </button>
  );
}

function JsonKey({ name }: { name: string }) {
  return (
    <>
      <JsonPunctuation>"</JsonPunctuation>
      <span className="json-token-key">{name}</span>
      <JsonPunctuation>"</JsonPunctuation>
    </>
  );
}

function JsonScalarToken({ descriptor, value }: { descriptor: "example" | "schema"; value: unknown }) {
  if (typeof value === "string") {
    const displayValue = descriptor === "schema" ? formatSchemaTypeLabel(value) : value;
    return (
      <>
        <JsonPunctuation>"</JsonPunctuation>
        <span className={descriptor === "schema" ? "json-token-schema-type" : "json-token-string"}>
          {displayValue}
        </span>
        <JsonPunctuation>"</JsonPunctuation>
      </>
    );
  }

  if (typeof value === "number") {
    return <span className="json-token-number">{value}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="json-token-literal">{String(value)}</span>;
  }

  if (value === null) {
    return <span className="json-token-null">null</span>;
  }

  if (value === undefined) {
    return <span className="json-token-literal">undefined</span>;
  }

  return <span className="json-token-string">{JSON.stringify(value)}</span>;
}

function JsonPunctuation({ children }: { children: ReactNode }) {
  return <span className="json-token-punctuation">{children}</span>;
}

function formatSchemaTypeLabel(value: string): string {
  return value.replace(/\s*\|\s*/g, " | ");
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
      {block.body ? <PromptPreviewBlockBody block={block} /> : null}
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
    sourceTitle: (part.sourcePaths ?? [`prompt part ${index + 1}`]).join("\n"),
    value: part.value
  };
}

function PromptPreviewBlockBody({ block }: { block: PromptPreviewBlock }) {
  if (Array.isArray(block.value) && block.value.every((item) => typeof item === "string")) {
    return (
      <div className="provider-preview-section-body provider-preview-token-list">
        {block.value.map((item) => (
          <span className="provider-contract-token" key={item}>
            {item}
          </span>
        ))}
      </div>
    );
  }

  return <pre className="provider-preview-section-body">{block.body}</pre>;
}

function formatSchemaManualTab(tab: SchemaManualTab): string {
  switch (tab) {
    case "messages":
      return "Provider Messages";
    case "rubric":
      return "Prompt Program";
    case "output":
      return "Output";
    case "evaluation":
      return "Evaluation";
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

function buildSchemaPreview(kind: "output" | "evaluation", section: SchemaManualSection): unknown {
  if (kind === "output" && section.promptSchema !== undefined) {
    return section.promptSchema;
  }

  const root: Record<string, unknown> = {};
  for (const field of section.fields) {
    const parts = field.path.split(".");
    let current = root;
    for (const [index, part] of parts.entries()) {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        current[part] = field.type;
        continue;
      }
      if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
  }
  return root;
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
    datasetType: "design",
    status: "draft",
    targetDisplay: "",
    strictness: "balanced",
    userMessage: "",
    expectedDecision: "ASK_MORE",
    tags: "",
    reviewerNote: "",
    userFacingMustMention: "",
    userFacingMustNotMention: "",
    hasExplicitDuration: "ignore",
    hasReturnPlan: "ignore",
    archivedReason: ""
  };
}

function emptyPromptCandidateForm(): PromptCandidateFormState {
  return {
    name: "",
    instructionPatch: "",
    rationale: ""
  };
}

function emptyExperimentArmForm(): ExperimentArmFormState {
  return {
    name: "",
    kind: "candidate_prompt",
    promptCandidateId: "",
    runId: "",
    notes: ""
  };
}

function formFromEvalCase(evalCase: AICheckCase): EvalFormState {
  const firstUserMessage = evalCase.input.messages.find((message) => message.role === "user")?.content ?? "";
  return {
    title: evalCase.title,
    datasetType: evalCase.datasetType,
    status: evalCase.status,
    targetDisplay: evalCase.input.targetDisplay,
    strictness: evalCase.input.strictness,
    userMessage: firstUserMessage,
    expectedDecision: getPrimaryExpectedDecision(evalCase.eval?.expectedOutput.decision) ?? "ASK_MORE",
    tags: joinList(evalCase.eval?.tags),
    reviewerNote: evalCase.eval?.reviewerNote ?? "",
    userFacingMustMention: joinList(evalCase.eval?.expectedOutput.userFacingMessage?.mustMention),
    userFacingMustNotMention: joinList(evalCase.eval?.expectedOutput.userFacingMessage?.mustNotMention),
    hasExplicitDuration: evidenceValueFromBoolean(evalCase.eval?.expectedInputEvidence?.hasExplicitDuration),
    hasReturnPlan: evidenceValueFromBoolean(evalCase.eval?.expectedInputEvidence?.hasReturnPlan),
    archivedReason: evalCase.archivedReason ?? ""
  };
}

function buildExpectedInputEvidence(form: EvalFormState): NonNullable<AICheckCase["eval"]>["expectedInputEvidence"] {
  return {
    ...(evidenceValueToBoolean(form.hasExplicitDuration) !== undefined
      ? { hasExplicitDuration: evidenceValueToBoolean(form.hasExplicitDuration) }
      : {}),
    ...(evidenceValueToBoolean(form.hasReturnPlan) !== undefined ? { hasReturnPlan: evidenceValueToBoolean(form.hasReturnPlan) } : {})
  };
}

function evidenceValueFromBoolean(value: boolean | undefined): EvidenceExpectationValue {
  if (value === true) return "true";
  if (value === false) return "false";
  return "ignore";
}

function evidenceValueToBoolean(value: EvidenceExpectationValue): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function splitList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function joinList(values: string[] | undefined): string {
  return values?.join(", ") ?? "";
}

function getPrimaryExpectedDecision(expectation: AICheckDecisionExpectation | undefined): AIDecision | null {
  if (!expectation) return null;
  if (typeof expectation === "string") return expectation;
  return expectation.exact ?? expectation.allowed?.[0] ?? null;
}

function caseMatchesSet(evalCase: AICheckCase, caseSet: (typeof CASE_SETS)[number]): boolean {
  if (!caseSet.includeArchived && evalCase.status === "archived") return false;
  if (!caseSet.statuses.includes(evalCase.status)) return false;
  if (caseSet.datasetTypes?.length && !caseSet.datasetTypes.includes(evalCase.datasetType)) return false;
  if (caseSet.tags?.length) {
    const tags = new Set(evalCase.eval?.tags ?? []);
    return caseSet.tags.some((tag) => tags.has(tag));
  }
  return true;
}

function isBuiltInEvalCase(evalCase: AICheckCase): boolean {
  return BUILT_IN_EVAL_CASE_IDS.has(evalCase.id);
}

function countCasesForSet(evalCases: AICheckCase[], caseSet: (typeof CASE_SETS)[number]): number {
  return evalCases.filter((evalCase) => caseMatchesSet(evalCase, caseSet)).length;
}

function buildExperimentFilters(form: ExperimentFormState): AICheckEvalRunFilters {
  return {
    statuses: form.status === "all" ? undefined : [form.status],
    datasetTypes: form.datasetType === "all" ? undefined : [form.datasetType],
    tags: form.tag === "all" ? undefined : [form.tag],
    strictness: form.strictness === "all" ? undefined : [form.strictness],
    expectedDecisions: form.expectedDecision === "all" ? undefined : [form.expectedDecision],
    includeArchived: form.includeArchived
  };
}

function caseMatchesExperiment(evalCase: AICheckCase, filters: AICheckEvalRunFilters): boolean {
  if (!filters.includeArchived && evalCase.status === "archived") return false;
  if (filters.statuses?.length && !filters.statuses.includes(evalCase.status)) return false;
  if (filters.datasetTypes?.length && !filters.datasetTypes.includes(evalCase.datasetType)) return false;
  if (filters.strictness?.length && !filters.strictness.includes(evalCase.input.strictness)) return false;
  if (filters.expectedDecisions?.length) {
    const expectedDecision = getPrimaryExpectedDecision(evalCase.eval?.expectedOutput.decision);
    if (!expectedDecision || !filters.expectedDecisions.includes(expectedDecision)) return false;
  }
  if (filters.tags?.length) {
    const tags = new Set(evalCase.eval?.tags ?? []);
    if (!filters.tags.some((tag) => tags.has(tag))) return false;
  }
  return true;
}

function formatRunFilter(filters: AICheckEvalRunFilters): string {
  const parts = [
    filters.datasetTypes?.join(","),
    filters.statuses?.join(","),
    filters.strictness?.join(","),
    filters.expectedDecisions?.join(","),
    filters.tags?.join(",")
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "all active";
}

function formatRunMode(mode: AICheckEvalRunMode): string {
  return mode === "release_review" ? "Release review" : "Tuning";
}

function formatReleaseDecision(decision: AICheckReleaseDecisionStatus): string {
  return decision === "approved" ? "Approved" : "Blocked";
}

function formatRecommendation(recommendation: AICheckPromptComparison["recommendation"]): string {
  switch (recommendation) {
    case "promote_candidate":
      return "Promote candidate";
    case "reject_candidate":
      return "Reject candidate";
    default:
      return "Revise candidate";
  }
}

function formatProvider(provider: "mock" | ProviderId): string {
  if (provider === "mock") return "Mock";
  return PROVIDERS.find((item) => item.id === provider)?.label ?? provider;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDecision(decision: AIDecision | null): string {
  if (!decision) return "No decision";
  return decision === "AI_COOLDOWN" ? "AI Cooldown" : decision.replace("_", " ");
}

function formatSnapshotSource(source: "persisted" | "derived" | null | undefined): string {
  if (source === "persisted") return "Runtime";
  if (source === "derived") return "Derived";
  return "unknown";
}

function formatStatus(status: AICheckCaseStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTag(tag: string): string {
  return tag.replaceAll("_", " ");
}

function formatCaseProvenance(provenanceType: AICheckCaseProvenance["type"]): string {
  switch (provenanceType) {
    case "authored":
      return "Authored";
    case "review":
      return "PM review";
    case "session":
      return "Real session";
    default:
      return formatStatusLabel(provenanceType);
  }
}

function formatProviderJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}
