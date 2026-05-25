# 2026-05-25 Run Review Console Design

Related docs:

- Progress: [2026-05-25-run-review-console-progress.md](2026-05-25-run-review-console-progress.md)
- Issues: [2026-05-25-run-review-console-issues.md](2026-05-25-run-review-console-issues.md)
- Prompt Engineering Console design: [2026-05-24-prompt-engineering-console-design.md](2026-05-24-prompt-engineering-console-design.md)
- Eval Job Model design: [2026-05-25-eval-job-model-design.md](2026-05-25-eval-job-model-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

Experiment Lab should become a run review console, not just a place to start runs and read aggregate metrics.

The current durable Eval Job Model fixes the execution problem: provider-mode evals can create durable jobs, show progress, survive frontend timeouts, and finalize into completed run artifacts. The remaining product gap is the review problem: after a run finishes, a PM still needs a clear way to understand which cases passed, which failed, why they failed, whether a candidate prompt improved or regressed behavior, and whether the run is safe enough for a release decision.

This design turns the existing Experiment Lab into a structured review workflow:

```text
Run Setup
  -> Active Jobs
  -> Run Results
  -> Case Detail Drawer
  -> A/B Case Diff
  -> Release Gate Drilldown
  -> Experiment Workspace context
```

This should be an internal refactor of the existing `Experiment Lab` area, not a new top-level navigation area.

## External Product References

This design follows established evaluation product patterns:

- LangSmith experiment analysis centers on result tables, customizable columns, sorting/filtering, trace review, evaluator runs, grouping, and diff views: [LangSmith Analyze an Experiment](https://docs.langchain.com/langsmith/analyze-an-experiment).
- Braintrust frames systematic evaluation as dataset, task, and scores, with immutable experiments, side-by-side comparison, CI/regression checks, and production feedback into datasets: [Braintrust Evaluate Systematically](https://www.braintrust.dev/docs/evaluate).
- Promptfoo's web viewer emphasizes eval selection, pass/fail/error filters, searchable result tables, detail actions, assertion/grading details, comparison, and exports: [Promptfoo Web Viewer](https://www.promptfoo.dev/docs/usage/web-ui/).
- OpenAI Evals models eval runs and output items separately, which supports the same product split between run summaries and per-item drilldown: [OpenAI Evals API](https://developers.openai.com/api/reference/resources/evals).

The common principle is that an evaluation product is an investigation workspace, not only a dashboard.

## Non-Goals

- Do not add a new top-level `Run Review Console` tab.
- Do not merge `Release Decision` and `Prompt Promotion`.
- Do not make active or partial jobs release-consumable evidence.
- Do not expose Holdout case details in tuning mode.
- Do not add automatic prompt optimization in this design.
- Do not change AI Check input, output, or evaluation schema unless a separate contract-first change requires it.
- Do not make cloud sync, team review, or remote experiment sharing part of this local-first design.

## Current Code Boundary

Current implementation already has strong execution primitives:

- `apps/extension/src/shared/types.ts` defines `AICheckEvalJob`, `AICheckEvalJobCaseState`, `AICheckPromptComparisonWorkflow`, `AICheckEvalRunSummary`, and `AICheckPromptComparison`.
- `apps/extension/src/ai/review-store.ts` creates durable jobs, persists case snapshots, finalizes completed jobs into run/result artifacts, and creates comparison workflows over baseline and candidate jobs.
- `apps/extension/src/background/message-router.ts` exposes job start/list/get/cancel/resume/retry and comparison workflow actions.
- `apps/extension/src/pages/review/ReviewPage.tsx` already shows Experiment Lab controls, active job cards, run metric cards, release gate summary, failures, A/B summary, and release decision controls.
- `apps/extension/src/ai/eval-engine.ts` creates per-case results and aggregate metrics.

Current product gaps:

- Finished runs are shown as aggregate metric cards plus a failed-case list, not a full result table.
- Case detail is not available from a run result row.
- Run review currently joins result data with the current editable case list, which can make old runs harder to interpret after case edits.
- A/B comparison shows improved/regressed counts but not per-case baseline-vs-candidate diffs.
- Release Gate shows status and text reasons but no drilldown from reason to dataset, metric, severity, or case group.
- Active job cards show progress but do not provide a stable transition from job execution into run review.

## Core Product Model

Keep the Eval Job Model boundary:

```text
Job = execution control
Run / Result / Comparison = finalized evidence
Workspace = PM experiment context
```

### Execution Control

`EvalJob`, `JobCaseState`, and `PromptComparisonWorkflow` represent running or incomplete work.

They can appear in `Active Jobs`, but they cannot be used for:

- release approval.
- prompt promotion.
- A/B final recommendation.
- completed run history evidence.

Active job metrics are provisional.

### Finalized Evidence

`AICheckEvalRun`, `AICheckEvalResult`, and `AICheckPromptComparison` represent completed evidence.

They can be used for:

- Run Results.
- Case Detail Drawer.
- A/B Case Diff.
- Release Gate Drilldown.
- Release Decision.
- Prompt Promotion, through comparison and promotion gate rules.

### Workspace Context

`AICheckExperiment` remains a PM workspace that links work and evidence. It should not duplicate run, result, job, or comparison data.

It should help the PM answer:

- What hypothesis is this workspace testing?
- Which runs belong to the hypothesis?
- Which candidate prompts were compared?
- Which suggestions, promotions, and release decisions came from the work?
- Which active jobs are still running for this workspace?

## Information Architecture

The top-level AIPM structure remains:

```text
Review
Case Library
Experiment Lab
Contract Reference
```

Inside Experiment Lab:

```text
Experiment Lab
  Run Setup
  Active Jobs
  Run Results
    Summary Cards
    Result Table
    Case Detail Drawer
  A/B Comparison
    Comparison Summary
    A/B Case Diff
    Textual Gradient
    Prompt Program Suggestions
  Release Gate
    Gate Summary
    Gate Drilldown
    Release Decision
  Experiment Workspace
    Workspace Context
    Linked Artifacts
    Arms
```

This is a product workflow, not necessarily a literal tab structure. The UI may keep the current three-column layout if the sections are visually separated and sequenced.

## Run Setup

Run Setup should only configure and start eval work.

It owns:

- provider.
- model.
- mode: `tuning` or `release_review`.
- dataset type.
- case lifecycle status filters.
- tag filters.
- strictness filters.
- expected decision filters.
- include archived toggle.
- selected candidate for A/B, when starting a comparison.
- run name or notes when useful.

It should not own:

- workspace creation.
- arm management.
- artifact linking.
- prompt suggestion review.
- release approval.

Those belong to workspace context, comparison review, or release review sections.

## Active Jobs

Active Jobs should answer: "What is currently running, and can I trust it yet?"

Each job card should show:

- job type: eval run, baseline A/B run, candidate A/B run, or parent A/B workflow.
- status: queued, running, cancel requested, failed, cancelled, completed.
- progress: succeeded / total, failed infrastructure count, running count.
- provider, model, mode, filter summary, and case count.
- workspace context when present.
- created/updated time.
- error summary when failed.
- actions: cancel, resume, retry failed.

Rules:

- Active job cards show provisional execution state.
- They must not show release approval actions.
- A completed job should transition the selected review context to its finalized run or comparison artifact.
- Manual refresh can remain, but active jobs should poll automatically while active work exists.

## Run Results

Run Results should answer: "What happened in this finalized run?"

### Summary Cards

Keep the existing aggregate metrics, but add enough context:

- pass rate.
- passed / total.
- false allow.
- false block.
- ASK_MORE recall failures.
- unsafe sensitive failures.
- schema/format failures.
- critical failures.
- provider/model/mode.
- dataset and filter summary.
- run artifact state: finalized, imported, or degraded snapshot.
- Holdout visibility mode.

### Result Table

Add a full per-case result table for finalized runs.

Default columns:

- outcome: pass or fail.
- case title.
- dataset type.
- case lifecycle status at run time, if known.
- strictness.
- expected decision.
- actual decision.
- failure reasons.
- severity.
- tags.
- snapshot source.
- raw output availability.

Table interactions:

- filter by pass/fail.
- filter by dataset type.
- filter by failure reason.
- filter by actual/expected decision.
- filter by tag.
- sort by severity, dataset, strictness, and outcome.
- click a row to open Case Detail Drawer.

Holdout rule:

- In `tuning` mode, Holdout rows should not reveal case title, tags, failure reasons, raw output, or input messages. They may appear only as aggregate protected rows or be hidden behind an aggregate Holdout summary.
- In `release_review` mode, controlled detail is allowed according to the Holdout policy below.

## Case Detail Drawer

Case Detail Drawer should answer: "Why did this case pass or fail?"

It should open from a result row and show:

- run metadata.
- case metadata from the run-time snapshot.
- snapshot source.
- input messages visible at the evaluated decision point.
- expected output assertions.
- actual parsed output.
- actual decision.
- failure reasons.
- raw provider output.
- provider attempt history when available.
- infrastructure error details when applicable.
- provenance and lineage.

Snapshot source should be explicit:

```ts
type RunReviewSnapshotSource =
  | "job_case_snapshot"
  | "imported_artifact"
  | "current_case_fallback"
  | "missing";
```

Rules:

- Prefer `JobCaseState.caseSnapshot` for runs produced by durable jobs.
- Do not silently treat the current editable case as historical truth.
- If only current-case fallback is available, display that as degraded evidence.
- CLI imported runs can be reviewed, but missing snapshots should be explicit.

## A/B Case Diff

A/B Case Diff should answer: "Did the candidate improve the behavior case by case?"

It should consume finalized comparison artifacts and their baseline/candidate runs.

Rows should show:

- case title or protected Holdout label.
- dataset type.
- strictness.
- expected decision.
- baseline actual decision.
- candidate actual decision.
- baseline pass/fail.
- candidate pass/fail.
- baseline failure reasons.
- candidate failure reasons.
- classification: improved, regressed, unchanged failed, unchanged passed, missing baseline, missing candidate.

Groups:

- regressed.
- improved.
- unchanged failed.
- unchanged passed.
- missing or incompatible rows.

Rules:

- A/B Diff should not rely only on aggregate pass rate.
- Regressions must be directly visible before promotion.
- If baseline and candidate run case sets differ, the UI must surface the mismatch instead of dropping rows.
- Candidate promotion should require no unresolved critical regressions and should require human review of all regressed rows.

## Release Gate Drilldown

Release Gate Drilldown should answer: "Why can or cannot this run be released?"

Keep the release gate summary, but add drilldown rows:

```ts
interface ReleaseGateDrilldownRow {
  gate: string;
  status: "pass" | "fail" | "warning";
  datasetType?: AICheckDatasetType;
  metric?: string;
  threshold?: string;
  actual?: string;
  severity?: AICheckSeverity;
  caseIds: string[];
  explanation: string;
}
```

Initial gates:

- schema validity.
- false allow critical failures.
- unsafe sensitive failures.
- regression dataset critical failures.
- Holdout material degradation.
- minimum dataset coverage warning.
- provider infrastructure clean status.

Rules:

- Release approval can only target finalized run ids.
- Release approval cannot target job ids or workflow ids.
- Runs containing Holdout cases cannot be approved unless mode is `release_review`.
- First implementation may treat minimum sample size as a warning, not a blocker.

## Holdout Visibility Policy

Holdout cases are for generalization checks and should not become tuning material.

Tuning mode:

- show aggregate Holdout pass/fail counts.
- show release gate status.
- do not show title, tags, messages, expected output, actual output, raw provider output, or detailed failure reasons.
- do not include Holdout details in Textual Gradient or prompt suggestions.

Release review mode:

- show controlled case title, expected decision, actual decision, and failure reason.
- allow Case Detail Drawer only for release decision review.
- raw provider output should be collapsed by default and can remain unavailable in first implementation.

## Review View Models

The UI should not join mutable stores ad hoc inside React components. Add stable view models from the store layer.

Recommended API layer:

```ts
interface RunReviewSummary {
  run: AICheckEvalRun;
  rows: RunReviewCaseRow[];
  releaseGate: ReleaseGateDrilldownRow[];
  snapshotCoverage: {
    total: number;
    jobCaseSnapshot: number;
    importedArtifact: number;
    currentCaseFallback: number;
    missing: number;
  };
}

interface RunReviewCaseRow {
  resultId: string;
  runId: string;
  evalCaseId: string;
  title: string;
  datasetType?: AICheckDatasetType;
  strictness?: StrictnessLevel;
  expectedDecision?: AIDecision;
  actualDecision: AIDecision;
  pass: boolean;
  failureReasons: string[];
  tags: string[];
  severity?: AICheckSeverity;
  snapshotSource: RunReviewSnapshotSource;
  holdoutVisibility: "aggregate_only" | "detail_allowed";
}

interface RunReviewCaseDetail {
  row: RunReviewCaseRow;
  caseSnapshot?: AICheckCase;
  result: AICheckEvalResult;
  rawProvider?: string;
  attempts?: AICheckEvalJobCaseAttempt[];
}

interface ComparisonReviewDiffRow {
  evalCaseId: string;
  classification:
    | "improved"
    | "regressed"
    | "unchanged_failed"
    | "unchanged_passed"
    | "missing_baseline"
    | "missing_candidate";
  baseline?: RunReviewCaseRow;
  candidate?: RunReviewCaseRow;
}
```

These view models are product review models, not AI Check contract schemas. If a future change adds new eval expectations, model output fields, or case schema fields, that change must start in `apps/extension/src/shared/ai-check-contract.json`.

## Dataset Health

Dataset Health is not required for the first UI slice, but the design should reserve space for it because it prevents the evaluation set from becoming unreadable.

It should eventually show:

- design/regression/holdout distribution.
- ready/draft/archived distribution.
- missing expected output.
- duplicate or near-duplicate cases.
- stale prompt/schema/evaluation versions.
- uncovered decision types.
- uncovered strictness levels.
- uncovered risk domains and policy dimensions.
- too-small release datasets.

## Failure Diagnosis

Failure diagnosis should remain conservative.

First implementation:

- deterministic grouping by failure reason, dataset, expected decision, actual decision, strictness, and tags.
- PM-facing categories such as prompt issue, rubric issue, schema issue, dataset issue, provider issue, and product policy issue can be added as reviewer annotations later.

Later implementation:

- Textual Gradient can summarize clusters, but it must remain diagnostic.
- It must not automatically modify the Prompt Program.
- It must not use protected Holdout details from tuning mode.

## Implementation Strategy

### Phase 1: Review View Models

- Add store-layer read APIs for run review and comparison review.
- Build rows from finalized runs/results and job snapshots when available.
- Add snapshot source and Holdout visibility fields.
- Keep completed artifact shapes unchanged.

### Phase 2: Result Table and Case Detail Drawer

- Replace failure-only list with full result table.
- Add row filters and row click detail drawer.
- Show expected vs actual, raw provider output, attempts, and snapshot source.
- Preserve Holdout visibility rules.

### Phase 3: A/B Case Diff

- Add comparison diff view over finalized baseline/candidate runs.
- Group by improved, regressed, unchanged failed, unchanged passed, and missing rows.
- Require visible regression review before candidate promotion.

### Phase 4: Release Gate Drilldown

- Add release gate drilldown rows.
- Show gate reason to metric/dataset/case mapping.
- Keep approval actions bound only to finalized run ids.

### Phase 5: Dataset Health and Policy Hardening

- Add dataset health diagnostics.
- Extract release gate policy into a clearer versioned policy model if gates become complex enough.
- Add provider reliability metrics such as latency, retry count, and timeout count before token/cost metrics.

## Validation Strategy

Automated validation:

- Typecheck.
- AI Check contract validation.
- Unit coverage for run review row derivation.
- Unit coverage for snapshot source fallback behavior.
- Unit coverage for A/B case-set mismatch.
- E2E coverage for result table, drawer, A/B diff, Holdout protection, and release gate drilldown.

Manual validation:

- Run a mock regression eval and inspect a passing case and failing case.
- Run a provider-mode eval and confirm completed results appear without extension reload.
- Run Candidate A/B and inspect regressed and improved rows.
- Confirm tuning-mode Holdout details stay protected.
- Confirm release approval is unavailable for active jobs, failed jobs, cancelled jobs, and tuning-mode Holdout runs.

