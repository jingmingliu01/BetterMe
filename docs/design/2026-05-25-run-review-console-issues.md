# 2026-05-25 Run Review Console Issues

Related docs:

- Design: [2026-05-25-run-review-console-design.md](2026-05-25-run-review-console-design.md)
- Progress: [2026-05-25-run-review-console-progress.md](2026-05-25-run-review-console-progress.md)
- Prompt Engineering Console issues: [2026-05-24-prompt-engineering-console-issues.md](2026-05-24-prompt-engineering-console-issues.md)
- Eval Job Model issues: [2026-05-25-eval-job-model-issues.md](2026-05-25-eval-job-model-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Experiment Lab information architecture is overloaded

Status: mitigated

Risk:

- Workspace setup, run setup, active jobs, run results, A/B comparison, release decision, and artifact linking are visually mixed.
- PMs may not understand the difference between running work, completed evidence, and workspace context.

Expected behavior:

- Experiment Lab should read as a workflow: setup, active execution, finalized review, comparison, release decision, workspace context.

Mitigation:

- Refactor Experiment Lab into Run Setup, Active Jobs, Run Results, Case Detail Drawer, A/B Case Diff, Release Gate Drilldown, and Experiment Workspace sections.
- Keep the existing top-level navigation.

Update 2026-05-25:

- Experiment Lab now exposes the run review workflow inside the existing top-level area. Active jobs, finalized run review, A/B diff, release gate drilldown, Dataset Health, and workspace context are visible without adding a new top-level tab.

### ISSUE-002: Finished run review is too shallow

Status: mitigated

Risk:

- Aggregate metrics and a failed-case list do not explain enough.
- PMs cannot inspect passing cases, borderline cases, or exact expected-vs-actual differences.
- Release decisions may be based on pass rate rather than evidence.

Expected behavior:

- Every finalized run should have a full result table.
- Every result row should open a case detail drawer.

Mitigation:

- Add `RunReviewSummary`, `RunReviewCaseRow`, and `RunReviewCaseDetail`.
- Build result table and drawer from store-layer view models.

Update 2026-05-25:

- Finished runs now load `RunReviewSummary` and render a full result table plus a Case Detail Drawer with expected output, actual provider output, failure reasons, attempts, and provenance.

### ISSUE-003: Historical runs can be interpreted using current case metadata

Status: mitigated

Risk:

- A case can be edited after a run.
- If run review joins results with the current editable case, historical evidence can drift.
- CLI imported runs may not have full snapshots.

Expected behavior:

- Run review should prefer run-time case snapshots.
- Degraded or missing snapshots should be explicit.

Mitigation:

- Prefer `JobCaseState.caseSnapshot` when available.
- Add `snapshotSource`.
- Display `current_case_fallback` and `missing` as degraded evidence.
- Do not silently treat current cases as historical snapshots.

Update 2026-05-25:

- Run review rows now carry `snapshotSource`. Durable job snapshots are preferred, current-case fallback is labeled, and missing snapshots are displayed explicitly for imported or degraded artifacts.

### ISSUE-004: Holdout details can leak through result table or drawer

Status: mitigated

Risk:

- Result Table, Case Detail Drawer, A/B Diff, Textual Gradient, or Release Gate Drilldown could expose Holdout titles, tags, messages, outputs, or failure reasons in tuning mode.
- Holdout cases would become tuning material and lose value.

Expected behavior:

- Tuning mode shows only aggregate Holdout information.
- Release review mode can show controlled detail for release decision review.

Mitigation:

- Add `holdoutVisibility` to run review rows and details.
- Gate row fields at the view-model layer, not only in React rendering.
- Add E2E coverage proving tuning-mode Holdout details are hidden in table, drawer, A/B diff, and Textual Gradient.

Update 2026-05-25:

- Run review rows and details now carry `holdoutVisibility`. Tuning-mode Holdout rows are protected at the store view-model layer before the UI renders them.

### ISSUE-005: Active jobs can be confused with release evidence

Status: mitigated

Risk:

- Active or failed jobs can contain provisional case results.
- PMs may assume a partially completed job can approve a release.

Expected behavior:

- Active jobs are execution state only.
- Release Decision and Prompt Promotion consume only finalized artifacts.

Mitigation:

- Active Jobs section must clearly label metrics as provisional.
- Release controls must accept finalized run ids only.
- No UI path should approve using a job id or workflow id.

Update 2026-05-25:

- Active job cards remain separated from finalized run review and explicitly describe running metrics as provisional. Release decisions continue to use finalized run ids only.

### ISSUE-006: A/B comparison lacks per-case evidence

Status: mitigated

Risk:

- Aggregate pass-rate improvements can hide critical regressions.
- Candidate promotion can be made without seeing which cases regressed.
- Baseline and candidate case-set mismatch can be ignored.

Expected behavior:

- A/B comparison should expose a per-case diff table.
- Regressions must be grouped and reviewed.
- Missing baseline/candidate rows must be explicit.

Mitigation:

- Add `ComparisonReviewDiffRow`.
- Group rows by improved, regressed, unchanged failed, unchanged passed, and missing.
- Require review of regressed rows before promotion.

Update 2026-05-25:

- A/B comparison now loads `ComparisonReviewSummary` and renders a per-case diff table grouped by regression/improvement/missing classifications.

### ISSUE-007: Release Gate reasons are not drillable

Status: mitigated

Risk:

- PM sees `FAIL` and a text reason but not the underlying metric, threshold, dataset, severity, or cases.
- It is unclear whether to fix prompt, rubric, schema, dataset, or provider reliability.

Expected behavior:

- Release Gate should show drilldown rows from gate reason to evidence.

Mitigation:

- Add `ReleaseGateDrilldownRow`.
- Map gates to dataset, metric, threshold, actual value, severity, case ids, and explanation.
- Add minimum dataset coverage as a warning before making it a blocker.

Update 2026-05-25:

- Run review now includes Release Gate Drilldown rows for overall gate status, schema validity, false allow failures, unsafe sensitive failures, regression critical failures, Holdout degradation, minimum coverage, and provider infrastructure history.

### ISSUE-008: Review view models can bypass contract-first boundaries

Status: mitigated

Risk:

- New review-only fields could be mistaken for AI Check schema fields.
- Developers may add eval expectation or model output fields outside `ai-check-contract.json`.

Expected behavior:

- Run Review view models are product review models.
- AI Check input, output, and evaluation schema remain contract-first.

Mitigation:

- Document that review view models are not AI Check contract schemas.
- Any new model output, case input, or eval expectation field must start in `apps/extension/src/shared/ai-check-contract.json`.
- Run `npm run check:ai-check-contract` after contract changes.

Update 2026-05-25:

- Review view models were added in `types.ts` as product-layer review models. No AI Check input, output, or evaluation schema change was made.

### ISSUE-009: Dataset health remains invisible

Status: mitigated

Risk:

- The eval set can become skewed, stale, too small, duplicated, or missing key decision coverage.
- Release confidence can be overstated even when the run technically passes.

Expected behavior:

- Dataset Health should show coverage and trust indicators before PMs rely on a run.

Mitigation:

- Add Dataset Health after the core review table and A/B diff.
- Track distribution, stale versions, missing expected outputs, duplicates, and uncovered decision/risk areas.

Update 2026-05-25:

- Experiment Lab now includes Dataset Health with dataset distribution, missing expected-output count, stale version count, decision coverage, and strictness coverage.

### ISSUE-010: Provider reliability and cost signals are missing

Status: mitigated

Risk:

- Provider-mode eval failures may be hard to distinguish from model behavior failures.
- PM cannot reason about latency, retry burden, or cost tradeoffs.

Expected behavior:

- First review layer should expose retry, timeout, and latency signals where available.
- Token and cost metrics can be added later.

Mitigation:

- Add provider attempt history to Case Detail Drawer.
- Add provider reliability summary to Run Results.
- Defer token/cost unless provider response metadata is stable enough.

Update 2026-05-25:

- Case Detail Drawer shows provider attempt history and infrastructure errors when durable job state exists. Release Gate Drilldown includes provider infrastructure status. Token and cost remain deferred until provider metadata is stable enough.
