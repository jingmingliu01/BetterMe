# 2026-05-25 Eval Job Model Progress

Related docs:

- Design: [2026-05-25-eval-job-model-design.md](2026-05-25-eval-job-model-design.md)
- Issues: [2026-05-25-eval-job-model-issues.md](2026-05-25-eval-job-model-issues.md)
- Prompt Engineering Console progress: [2026-05-24-prompt-engineering-console-progress.md](2026-05-24-prompt-engineering-console-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Status: design accepted, implementation not started.

The Prompt Engineering Console exists, but eval execution is still implemented as a long request/response path. Provider-mode runs can outlive the frontend timeout and only become visible after a later reload or refresh once the background has saved the completed run.

This document tracks the implementation of the durable job model that should replace that behavior.

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
- Release Gate and Release Decision flows over completed runs.
- Manual refresh button for experiment artifacts.

## Confirmed Gaps

- No durable `EvalJob` store.
- No durable per-case job state.
- No prompt-comparison workflow state.
- No immediate job id returned to UI when an eval starts.
- No active job card or progress UI.
- No automatic polling of active jobs.
- No job cancellation semantics.
- No resume semantics for MV3 service-worker interruption.
- No case snapshot freeze at job creation.
- No bounded provider concurrency policy in provider config.
- No provider external abort signal for user cancellation.
- No infrastructure-failure boundary that prevents partial or contaminated runs from entering release gates.
- No workspace auto-linking for active jobs.

## Planned Phases

### Phase 1: Durable Job Foundation

Status: not started

Scope:

- Add `EvalJob`, `JobCaseState`, and `PromptComparisonWorkflow` types.
- Add `evalJobs`, `evalJobCaseStates`, and `promptComparisonWorkflows` IndexedDB stores.
- Add storage helpers for job create/list/get/update.
- Add job progress derivation.
- Keep completed artifact shapes unchanged.

Validation target:

- Creating a job stores job metadata and frozen case snapshots without creating `evalRuns` or `evalResults`.

### Phase 2: Single Eval Job Runner

Status: not started

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

Status: not started

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

Status: not started

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

Status: not started

Scope:

- Convert A/B comparison execution to `PromptComparisonWorkflow`.
- Create baseline and candidate child eval jobs.
- Show baseline and candidate progress side by side.
- Create `AICheckPromptComparison` only after both child jobs finalize.
- Fail or cancel the parent workflow when either child job cannot complete.

Validation target:

- A/B comparison no longer blocks on one frontend request and cannot produce a comparison artifact from partial child runs.

## Validation Status

No implementation validation has been run for the job model because this change is currently documentation-only.

Design validation performed:

- Reviewed current PM Review, background message router, eval engine, review store, IndexedDB stores, provider client, and provider config boundaries.
- Cross-reviewed the proposal through subagents focused on MV3 lifecycle, data/API model, and product UX risks.
- Confirmed that the key implementation boundary should be job state separate from completed evidence artifacts.

## Documentation Check

This progress document was created together with the linked design and issues documents.

The existing Prompt Engineering Console documents were also checked because this job model affects Experiment Lab execution semantics. They now link to this design topic and track the long-running provider execution gap.

