# 2026-05-25 Eval Job Model Progress

Related docs:

- Design: [2026-05-25-eval-job-model-design.md](2026-05-25-eval-job-model-design.md)
- Issues: [2026-05-25-eval-job-model-issues.md](2026-05-25-eval-job-model-issues.md)
- Prompt Engineering Console progress: [2026-05-24-prompt-engineering-console-progress.md](2026-05-24-prompt-engineering-console-progress.md)
- Run Review Console progress: [2026-05-25-run-review-console-progress.md](2026-05-25-run-review-console-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Status: implemented and validated.

The Prompt Engineering Console now starts eval and Candidate Prompt A/B work through durable local jobs instead of relying on one long frontend request. Provider-mode runs create visible job state immediately, persist per-case progress, finalize into normal run/result artifacts only after completion, and can be refreshed or polled without reloading the extension.

Run Review Console design is now fixed as the next layer above this model. The job model remains responsible for execution control; Run Review Console is responsible for finalized run and comparison investigation.

This document remains the scaffold for maintaining and extending the durable job model.

## Product Decisions Locked

- Job state must be separate from completed run/result/comparison artifacts.
- `AICheckEvalRun` and `AICheckEvalResult` remain completed evidence only.
- Partial job results must stay under job state until finalization.
- Infrastructure failures after retry should fail the job and should not generate release-consumable run evidence.
- Model behavior failures should still finalize as normal eval results because they are valid evidence.
- Provider-mode concurrency should start conservatively, with `maxConcurrency = 1`.
- UI should poll active jobs automatically and keep manual refresh as a fallback.
- A/B comparison should be a parent workflow over baseline and candidate eval jobs.
- Jobs started from an Experiment Workspace should carry workspace context and auto-link finalized artifacts back to that workspace.

## Already Exists

- Experiment Lab tab.
- Current Prompt Program run controls.
- Provider-mode eval execution.
- Mock-mode eval execution.
- Candidate Prompt A/B comparison.
- Textual Gradient generation from comparisons.
- Experiment Workspaces.
- Completed `evalRuns` and `evalResults` stores.
- Completed `promptComparisons` store.
- Durable `evalJobs` and `evalJobCaseStates` stores.
- Durable `promptComparisonWorkflows` store.
- Job-oriented Review APIs for create/start/list/get/cancel/resume/retry.
- Active job cards in Experiment Lab.
- Automatic polling while jobs are active.
- Provider-mode eval cancellation through external abort signals.
- Per-provider eval execution policy in `provider-config.json`.
- Release Gate and Release Decision flows over completed runs.
- Manual refresh button for experiment artifacts.

## Confirmed Gaps

- IndexedDB stores currently rely on store scans rather than explicit indexes. This is acceptable for the current local dataset size but can be optimized later.
- The first UI slice supports retrying failed cases as a job-level action, not per-case checkboxes.
- Provider execution policy is configured with conservative defaults; provider-specific tuning can be adjusted later.

## Planned Phases

### Phase 1: Durable Job Foundation

Status: implemented

Scope:

- Add `EvalJob`, `JobCaseState`, and `PromptComparisonWorkflow` types.
- Add `evalJobs`, `evalJobCaseStates`, and `promptComparisonWorkflows` IndexedDB stores.
- Add storage helpers for job create/list/get/update.
- Add job progress derivation.
- Keep completed artifact shapes unchanged.

Validation target:

- Creating a job stores job metadata and frozen case snapshots without creating `evalRuns` or `evalResults`.

### Phase 2: Single Eval Job Runner

Status: implemented

Scope:

- Extract a single-case runner from the current eval engine.
- Add provider cancellation via external `AbortSignal`.
- Persist each case result/error after it completes.
- Finalize succeeded jobs into the existing `AICheckEvalRunSummary` shape.
- Mark jobs failed when infrastructure failures remain after retry.
- Start provider-mode concurrency at 1.

Validation target:

- A slow 44-case provider run returns a job immediately, survives frontend timeout, persists progress, and finalizes into exactly one completed run only after all cases succeed.

### Phase 3: Experiment Lab Job UI

Status: implemented

Scope:

- Replace blocking eval/comparison UI states with active job cards.
- Add job polling.
- Add cancel, retry, and resume controls.
- Show provisional progress separately from completed run results.
- Show infrastructure failures without exposing Holdout details in tuning mode.
- Disable release decisions for running, failed, cancelled, or partial jobs.
- Auto-link jobs and finalized artifacts to the selected workspace.

Validation target:

- User can click `Run Eval`, see active progress without reload, and see completed results appear automatically when the job finalizes.

### Phase 4: Lease, Resume, and Bounded Parallelism

Status: implemented

Scope:

- Add job lease owner and lease expiry.
- Resume stale running jobs after service-worker restart.
- Add provider execution policy.
- Add bounded concurrency.
- Add retry backoff.
- Protect `data/deleteAll` from stale runner writes.

Validation target:

- Killing or reloading the extension during a run does not lose succeeded case states and does not create duplicate results after resume.

### Phase 5: Prompt Comparison Workflow

Status: implemented

Scope:

- Convert A/B comparison execution to `PromptComparisonWorkflow`.
- Create baseline and candidate child eval jobs.
- Show baseline and candidate progress side by side.
- Create `AICheckPromptComparison` only after both child jobs finalize.
- Fail or cancel the parent workflow when either child job cannot complete.

Validation target:

- A/B comparison no longer blocks on one frontend request and cannot produce a comparison artifact from partial child runs.

## Validation Status

Implementation validation performed:

- Reviewed current PM Review, background message router, eval engine, review store, IndexedDB stores, provider client, and provider config boundaries.
- Cross-reviewed the proposal through subagents focused on MV3 lifecycle, data/API model, and product UX risks.
- Confirmed that the key implementation boundary should be job state separate from completed evidence artifacts.
- `npm --workspace apps/extension run typecheck` passed.
- `npm --workspace apps/extension run check:ai-check-contract` passed.
- `npm --workspace apps/extension run test:ai-check` passed.
- `npm --workspace apps/extension run build` passed.
- `npm --workspace apps/extension run test:e2e` passed.

Pending implementation validation:

- None for the implemented Eval Job Model scope.

## Documentation Check

This progress document was updated together with the linked design and issues documents.

The existing Prompt Engineering Console documents were also checked because this job model affects Experiment Lab execution semantics. They link to this design topic and track the long-running provider execution gap as mitigated by the durable job model.
