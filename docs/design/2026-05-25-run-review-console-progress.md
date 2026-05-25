# 2026-05-25 Run Review Console Progress

Related docs:

- Design: [2026-05-25-run-review-console-design.md](2026-05-25-run-review-console-design.md)
- Issues: [2026-05-25-run-review-console-issues.md](2026-05-25-run-review-console-issues.md)
- Prompt Engineering Console progress: [2026-05-24-prompt-engineering-console-progress.md](2026-05-24-prompt-engineering-console-progress.md)
- Eval Job Model progress: [2026-05-25-eval-job-model-progress.md](2026-05-25-eval-job-model-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Status: design fixed, not implemented.

Sub-agent review of the current codebase and the proposed product direction is complete. The recommended direction is to keep the existing top-level AIPM navigation and refactor the internal `Experiment Lab` experience into a Run Review Console workflow.

The durable execution layer is already implemented through the Eval Job Model. The remaining work is mostly the finalized run/comparison review layer: result table, case detail drawer, A/B case diff, release gate drilldown, and stable store-layer view models.

## Product Decisions Locked

- Do not add a new top-level `Run Review Console` area.
- `Experiment Lab` becomes the review-oriented experiment workspace.
- Active jobs are execution state only and cannot be release evidence.
- Finalized runs/results/comparisons are the only release-consumable evidence.
- Run review must prefer run-time case snapshots over current editable cases.
- Snapshot source must be visible when evidence is degraded or missing.
- A/B review must expose per-case diff rows, not only aggregate metrics.
- Release Gate must support drilldown from gate reason to dataset, metric, severity, and case group.
- Holdout details stay hidden in tuning mode.
- Release review mode can expose controlled Holdout detail for release decision review.
- Release Decision and Prompt Promotion stay separate product actions.

## Already Exists

- Top-level AIPM areas: History Cases, Evaluation Cases, Experiment Lab, Contract Reference.
- Current Experiment Lab controls for provider, model, mode, dataset, status, strictness, expected decision, tags, archived toggle, and run actions.
- Durable Eval Job Model.
- Active job cards with progress and cancel/resume/retry actions.
- Completed `evalRuns` and `evalResults`.
- Completed `promptComparisons`.
- Candidate Prompt A/B workflow over baseline and candidate eval jobs.
- Release Gate summary.
- Release Decision records over completed runs.
- Holdout protection in tuning mode.
- Prompt Program Suggestions and Textual Gradient from completed comparisons.
- Experiment Workspaces that link artifacts.

## Confirmed Gaps

- No stable `RunReviewSummary` or `ComparisonReview` store-layer view model exists yet.
- Finished run review uses aggregate cards and a failure-only list instead of a full result table.
- Case detail from a run result row does not exist yet.
- Run review can be polluted by current-case edits because finalized run artifacts do not carry all case metadata directly.
- A/B comparison does not yet show per-case baseline-vs-candidate rows.
- Release Gate does not yet provide reason-to-case drilldown.
- Snapshot source is not visible in the UI.
- Dataset Health is not implemented.
- Provider latency, retry, timeout, token, and cost metrics are not yet exposed as review metrics.
- Service-worker restart and duplicate-finalize scenarios have limited explicit E2E coverage.

## Planned Phases

### Phase 1: Review View Models

Status: planned

Scope:

- Add `RunReviewSummary`.
- Add `RunReviewCaseRow`.
- Add `RunReviewCaseDetail`.
- Add `ComparisonReviewDiffRow`.
- Add `ReleaseGateDrilldownRow`.
- Add `snapshotSource` and `holdoutVisibility` fields.
- Add store/message-router APIs such as `review/getRunReview` and `review/getComparisonReview`.

Validation target:

- Review APIs can return stable rows for a finalized run without the React UI doing ad hoc store joins.

### Phase 2: Result Table and Case Detail Drawer

Status: planned

Scope:

- Replace the failure-only run list with a full result table.
- Add pass/fail, dataset, expected/actual decision, failure reason, strictness, tag, and severity filters.
- Add row click detail drawer.
- Show expected output, actual parsed output, raw provider output, failure reasons, job attempts, and snapshot source.
- Preserve Holdout detail protection in tuning mode.

Validation target:

- PM can inspect any finalized result row and understand why it passed or failed.

### Phase 3: A/B Case Diff

Status: planned

Scope:

- Add per-case diff over baseline and candidate finalized runs.
- Group rows into improved, regressed, unchanged failed, unchanged passed, and missing rows.
- Surface case-set mismatch explicitly.
- Require review of regressed rows before promotion.

Validation target:

- PM can identify exactly which cases improved or regressed before promoting a candidate prompt.

### Phase 4: Release Gate Drilldown

Status: planned

Scope:

- Add gate drilldown rows.
- Map gate reasons to metric, dataset, threshold, actual value, severity, and case ids.
- Keep release approval bound only to finalized run ids.
- Add minimum dataset coverage warning.

Validation target:

- PM can see why a release gate failed and which cases or metrics caused it.

### Phase 5: Dataset Health and Policy Hardening

Status: planned

Scope:

- Add dataset health diagnostics.
- Identify missing expected outputs, stale versions, uncovered decision types, too-small datasets, and duplicate cases.
- Consider a versioned Release Gate Policy model if thresholds become complex.
- Add provider reliability metrics before token/cost metrics.

Validation target:

- PM can tell whether the eval set is healthy enough to trust before using results for release decisions.

## Validation Status

No implementation validation has run for this design because this change fixes the design scaffold only.

Current related validation from the Eval Job Model implementation remains relevant:

- AI Check contract validation.
- Typecheck.
- AI Check tests.
- Extension build.
- Extension E2E.
- Diff whitespace check.

These should be rerun after implementing the Run Review Console phases.

## Document Maintenance Notes

The Prompt Engineering Console and Eval Job Model document sets were checked because this design depends on both. They should link to this design as the review-layer continuation after durable job execution.

