# 2026-05-25 Run Review Console Progress

Related docs:

- Design: [2026-05-25-run-review-console-design.md](2026-05-25-run-review-console-design.md)
- Issues: [2026-05-25-run-review-console-issues.md](2026-05-25-run-review-console-issues.md)
- Prompt Engineering Console progress: [2026-05-24-prompt-engineering-console-progress.md](2026-05-24-prompt-engineering-console-progress.md)
- Eval Job Model progress: [2026-05-25-eval-job-model-progress.md](2026-05-25-eval-job-model-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Status: implemented and validated.

Sub-agent review of the current codebase and the proposed product direction is complete. The recommended direction is to keep the existing top-level AIPM navigation and refactor the internal `Experiment Lab` experience into a Run Review Console workflow.

The durable execution layer is already implemented through the Eval Job Model. The finalized run/comparison review layer is now implemented with store-layer view models, result table, case detail drawer, A/B case diff, release gate drilldown, Dataset Health, and provider attempt visibility.

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
- `RunReviewSummary`, `RunReviewCaseRow`, `RunReviewCaseDetail`, `ComparisonReviewSummary`, `ComparisonReviewDiffRow`, and `ReleaseGateDrilldownRow`.
- `review/getRunReview` and `review/getPromptComparisonReview` message routes.
- Full finalized run result table.
- Run case detail drawer with expected output, raw provider output, attempts, provenance, and snapshot source.
- Per-case A/B diff table.
- Release Gate Drilldown rows.
- Dataset Health section.
- Active job cards with filter and workspace context.

## Confirmed Gaps

- Provider latency, timeout, token, and cost metrics are not yet exposed as review metrics. Provider attempts and retry errors are visible when job state exists.
- Service-worker restart and duplicate-finalize scenarios have limited explicit E2E coverage.
- IndexedDB review view models still use local store scans. This remains acceptable for the current local dataset scale.

## Planned Phases

### Phase 1: Review View Models

Status: implemented

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

Status: implemented

Scope:

- Replace the failure-only run list with a full result table.
- Add pass/fail, dataset, expected/actual decision, failure reason, strictness, tag, and severity filters.
- Add row click detail drawer.
- Show expected output, actual parsed output, raw provider output, failure reasons, job attempts, and snapshot source.
- Preserve Holdout detail protection in tuning mode.

Validation target:

- PM can inspect any finalized result row and understand why it passed or failed.

### Phase 3: A/B Case Diff

Status: implemented

Scope:

- Add per-case diff over baseline and candidate finalized runs.
- Group rows into improved, regressed, unchanged failed, unchanged passed, and missing rows.
- Surface case-set mismatch explicitly.
- Require review of regressed rows before promotion.

Validation target:

- PM can identify exactly which cases improved or regressed before promoting a candidate prompt.

### Phase 4: Release Gate Drilldown

Status: implemented

Scope:

- Add gate drilldown rows.
- Map gate reasons to metric, dataset, threshold, actual value, severity, and case ids.
- Keep release approval bound only to finalized run ids.
- Add minimum dataset coverage warning.

Validation target:

- PM can see why a release gate failed and which cases or metrics caused it.

### Phase 5: Dataset Health and Policy Hardening

Status: implemented for Dataset Health; policy extraction remains deferred

Scope:

- Add dataset health diagnostics.
- Identify missing expected outputs, stale versions, uncovered decision types, too-small datasets, and duplicate cases.
- Consider a versioned Release Gate Policy model if thresholds become complex.
- Add provider reliability metrics before token/cost metrics.

Validation target:

- PM can tell whether the eval set is healthy enough to trust before using results for release decisions.

## Validation Status

Implementation validation completed.

Validated commands:

- `npm --workspace apps/extension run check:ai-check-contract`
- `npm --workspace apps/extension run typecheck`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run build`
- `npm --workspace apps/extension run test:e2e`
- `git diff --check`

The extension E2E suite now includes Run Review Console assertions for the result table, Case Detail Drawer, Release Gate Drilldown, snapshot source, Holdout protection, imported missing snapshots, and A/B case diff.

## Document Maintenance Notes

The Prompt Engineering Console and Eval Job Model document sets were checked because this design depends on both. The Prompt Engineering Console progress document now references the implemented Run Review Console layer. The Run Review Console issues document was updated with mitigation notes for the implementation. The design document did not need a content change after validation because the implementation follows the fixed scope rather than changing the product direction.
