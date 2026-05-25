# 2026-05-25 Eval Job Model Design

Related docs:

- Progress: [2026-05-25-eval-job-model-progress.md](2026-05-25-eval-job-model-progress.md)
- Issues: [2026-05-25-eval-job-model-issues.md](2026-05-25-eval-job-model-issues.md)
- Prompt Engineering Console design: [2026-05-24-prompt-engineering-console-design.md](2026-05-24-prompt-engineering-console-design.md)
- Prompt Engineering Console progress: [2026-05-24-prompt-engineering-console-progress.md](2026-05-24-prompt-engineering-console-progress.md)
- Prompt Engineering Console issues: [2026-05-24-prompt-engineering-console-issues.md](2026-05-24-prompt-engineering-console-issues.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

Experiment Lab should make long-running Prompt Program evaluations feel like a visible product workflow, not a blocking request.

The current synchronous `Run Eval` behavior is not a reliable product model for provider-mode runs. A 44-case provider eval can exceed the frontend message timeout, show "BetterMe background did not respond", and still finish later in the background. Reloading the extension can then reveal the saved result. That behavior is confusing because the product has no durable representation of the work while it is running.

The correct model is a local-first job system:

```text
PM starts an eval or A/B comparison
  -> product creates a durable job immediately
  -> background runner processes cases with bounded concurrency
  -> UI polls visible job progress
  -> completed jobs finalize into normal eval artifacts
  -> release/comparison workflows consume only finalized artifacts
```

The goal is not just automatic refresh. The goal is to make eval execution observable, resumable, cancellable, and safe under Chrome MV3 service-worker lifecycle constraints.

## Non-Goals

- Do not preserve old local PM Review data as a migration constraint. The product has no meaningful legacy job data.
- Do not make cloud execution or remote queues part of this design.
- Do not make `AICheckEvalRun` a running job object.
- Do not let partial runs enter Release Decision or Prompt Comparison as complete evidence.
- Do not implement automatic prompt optimization as part of the job model.
- Do not introduce unbounded provider parallelism.

## Core Principle

Keep three product layers separate:

```text
Job = execution control
Run/Result/Comparison = completed evidence
Workspace = PM experiment context
```

This boundary is the main design decision.

### Execution Control Layer

`EvalJob` and `JobCaseState` describe work that is queued, running, failed, cancelled, or waiting to finalize.

They own:

- status.
- progress.
- retries.
- errors.
- cancellation.
- leases.
- case snapshots.
- provider execution settings.
- workspace or comparison context.

### Evidence Artifact Layer

`AICheckEvalRun`, `AICheckEvalResult`, and `AICheckPromptComparison` remain completed evidence artifacts.

They should not contain:

- running status.
- progress.
- partial metrics.
- cancelled state.
- retry attempts.
- infrastructure error state.

This keeps Release Gate, Run History, CLI import, Prompt Comparison, and Promotion semantics clean.

### Workspace Context Layer

`AICheckExperiment` remains a PM workspace. It links related artifacts and active jobs, but it does not replace or duplicate their authoritative data.

It owns:

- workspace name and notes.
- arms.
- linked finalized runs.
- linked comparisons.
- linked suggestions.
- linked release decisions.
- linked promotions.
- active job references while work is running.

## Current Code Boundary

Current implementation anchors:

- `apps/extension/src/pages/shared/api.ts` wraps `chrome.runtime.sendMessage` calls with frontend timeouts.
- `apps/extension/src/pages/review/ReviewPage.tsx` currently treats eval and comparison execution as blocking UI actions.
- `apps/extension/src/background/message-router.ts` exposes `review/runEvalExperiment` and `review/runPromptComparison` as request/response actions.
- `apps/extension/src/ai/eval-engine.ts` builds a run and results in memory, then returns the full summary.
- `apps/extension/src/ai/review-store.ts` saves eval runs and results only after full completion.
- `apps/extension/src/storage/indexed-db.ts` stores completed artifacts but has no job stores.
- `apps/extension/src/shared/provider-config.json` owns provider metadata, but not provider execution limits yet.

These surfaces should be refactored around the job model without changing the completed artifact contract unless the AI Check contract itself changes.

## Data Model

### EvalJobStatus

```ts
type EvalJobStatus =
  | "queued"
  | "running"
  | "cancel_requested"
  | "completed"
  | "failed"
  | "cancelled";
```

Meaning:

- `queued`: durable job exists but no worker currently owns it.
- `running`: a worker owns a valid lease and at least one case may be in progress.
- `cancel_requested`: user requested cancellation; runner should stop at the next safe boundary and abort active provider calls when possible.
- `completed`: job finalized into a complete run artifact.
- `failed`: job cannot finalize because infrastructure or unrecovered case execution failed.
- `cancelled`: user cancellation completed and no final run artifact was produced.

### JobCaseStatus

```ts
type JobCaseStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "retryable_failed"
  | "failed"
  | "cancelled"
  | "skipped";
```

Meaning:

- `pending`: not started.
- `running`: currently leased by a runner.
- `succeeded`: has a valid partial result stored under the job.
- `retryable_failed`: failed for a retryable infrastructure reason.
- `failed`: exhausted retries or failed for a non-retryable infrastructure reason.
- `cancelled`: did not complete because the parent job was cancelled.
- `skipped`: intentionally not run because the parent workflow stopped.

### EvalJob

```ts
interface EvalJob {
  id: string;
  kind: "eval_run";
  reservedRunId: string;
  outputRunId?: string;
  request: {
    filters: AICheckEvalRunFilters;
    mode: AICheckEvalRunMode;
    provider: AICheckEvalRun["provider"];
    providerMode: AICheckEvalRun["providerMode"];
    model: string;
    promptVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
    selectedCaseIds: string[];
    systemPromptAddendum?: string;
  };
  execution: {
    maxConcurrency: number;
    retryLimit: number;
    cancelRequestedAt?: string;
    leaseOwner?: string;
    leaseExpiresAt?: string;
  };
  progress: {
    total: number;
    pending: number;
    running: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  };
  context?: {
    experimentId?: string;
    armId?: string;
    promptComparisonWorkflowId?: string;
    comparisonRole?: "baseline" | "candidate";
    promptCandidateId?: string;
  };
  status: EvalJobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}
```

### JobCaseState

```ts
interface JobCaseState {
  id: string; // `${jobId}:${evalCaseId}`
  jobId: string;
  reservedRunId: string;
  evalCaseId: string;
  caseSnapshot: AICheckCase;
  status: JobCaseStatus;
  attempts: Array<{
    attempt: number;
    status: "succeeded" | "failed" | "cancelled";
    startedAt: string;
    finishedAt?: string;
    providerErrorCode?: ProviderErrorCode;
    error?: string;
  }>;
  result?: AICheckEvalResult;
  createdAt: string;
  updatedAt: string;
}
```

Important rules:

- `caseSnapshot` is required. Resume must replay the case selected at job creation time, not the current editable case.
- `result` is a job-local partial result. It is not part of official `evalResults` until finalize.
- Result ids should be deterministic, preferably `${reservedRunId}:${evalCaseId}`, or finalize must enforce one result per run/case.

### PromptComparisonWorkflow

Prompt A/B should be represented as a workflow over child jobs, not as a running comparison artifact.

```ts
interface PromptComparisonWorkflow {
  id: string;
  baselineJobId: string;
  candidateJobId: string;
  outputComparisonId?: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancel_requested"
    | "cancelled";
  context?: {
    experimentId?: string;
    baselineArmId?: string;
    candidateArmId?: string;
    promptCandidateId: string;
  };
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
}
```

`AICheckPromptComparison` should be created only after both child eval jobs finalize into completed run artifacts.

## IndexedDB Stores

Add stores:

- `evalJobs`
- `evalJobCaseStates`
- `promptComparisonWorkflows`

Do not store running jobs inside:

- `evalRuns`
- `evalResults`
- `promptComparisons`

Recommended indexes:

- `evalJobs.status`
- `evalJobs.updatedAt`
- `evalJobs.context.experimentId`
- `evalJobs.context.promptComparisonWorkflowId`
- `evalJobCaseStates.jobId`
- `evalJobCaseStates.status`
- `promptComparisonWorkflows.status`
- `promptComparisonWorkflows.context.experimentId`

## Background API

Add job-oriented Review APIs:

- `review/createEvalJob`: freeze selected cases, versions, provider/model, filters, workspace context, and `reservedRunId`.
- `review/startEvalJob`: start or enqueue execution and return immediately with job summary.
- `review/getEvalJob`: return job plus aggregate progress.
- `review/listEvalJobs`: return active and recent jobs, optionally filtered by workspace.
- `review/cancelEvalJob`: set `cancel_requested`.
- `review/resumeEvalJob`: resume lease-expired or failed jobs that have unfinished case states.
- `review/retryEvalJobCases`: retry failed job cases before finalization.
- `review/finalizeEvalJob`: convert succeeded job results into completed `AICheckEvalRunSummary` only when all cases are terminal and no infrastructure failures remain.
- `review/startPromptComparisonWorkflow`: create baseline and candidate eval jobs plus a parent workflow.
- `review/getPromptComparisonWorkflow`
- `review/listPromptComparisonWorkflows`
- `review/cancelPromptComparisonWorkflow`

Compatibility:

- `review/runEvalExperiment` may remain temporarily as a wrapper around create/start/wait/finalize for tests or CLI-like flows.
- `review/runPromptComparison` may remain temporarily as a wrapper around the workflow model.
- The PM Review UI should move to job APIs instead of relying on blocking wrappers.

## Runner Semantics

### Job Creation

When the PM clicks `Run Eval`:

1. Resolve the selected cases.
2. Snapshot each case into `JobCaseState`.
3. Store `EvalJob` with `queued` status.
4. Return `jobId` immediately.
5. UI starts polling.

### Execution

The runner:

1. Acquires a lease.
2. Moves job to `running`.
3. Picks pending or retryable cases.
4. Runs cases with bounded concurrency.
5. Persists each case result or error immediately.
6. Recomputes progress after each case.
7. Extends the lease while active.
8. Finalizes only after every case reaches a terminal state and no infrastructure failure blocks completion.

### Bounded Concurrency

Provider execution should be bounded and provider-specific.

Initial default:

```text
maxConcurrency = 1 for provider-mode
maxConcurrency = 4 for mock/local-only mode
```

Provider config should eventually include execution policy:

```json
{
  "evalExecution": {
    "defaultMaxConcurrency": 1,
    "retryLimit": 2,
    "retryBackoffMs": [1000, 3000, 10000]
  }
}
```

Do not run all selected cases with unbounded `Promise.all`.

### Infrastructure Failure Rule

Infrastructure failures should not produce a normal completed run.

Examples:

- provider 429.
- provider timeout after retries.
- missing or invalid API key.
- network failure.
- unrepaired schema parse failure that prevents a valid model output.
- service-worker interruption before all terminal states are known.

Recommended product rule:

```text
If any case fails for infrastructure reasons after retries, the job is failed and cannot enter Release Gate.
```

The PM can retry failed cases or start a new job. A failed job stays visible in history with progress and error context, but it does not create a completed `AICheckEvalRun`.

Model behavior failures are different. If the provider returned a valid model output and the eval assertion failed, that is a normal completed result and should count in metrics.

### Cancellation

Cancellation is durable:

1. UI sends `review/cancelEvalJob`.
2. Store sets job status to `cancel_requested`.
3. Runner observes the flag.
4. Active provider request is aborted if its `AbortSignal` is still alive.
5. Pending cases become `cancelled`.
6. Job becomes `cancelled`.
7. No completed run artifact is produced.

Provider client should accept an external abort signal in addition to its per-request timeout.

### Resume

Because BetterMe is a Chrome MV3 extension, service workers can be stopped and restarted. The job system must not depend on long-lived in-memory state.

Resume behavior:

- On PM Review load, list active jobs and stale running jobs.
- On service-worker start or first relevant message, detect running jobs with expired leases.
- Move stale running cases back to pending or retryable state according to their attempt history.
- Resume with the original case snapshots.
- Do not duplicate results for already succeeded cases.

### Delete All Data

`data/deleteAll` and similar destructive local reset actions must handle active jobs explicitly.

Required behavior:

- cancel or block active jobs before clearing stores.
- prevent old runner promises from writing into newly cleared stores.
- clear job stores and completed artifact stores consistently.

## UI Model

Experiment Lab should show three distinct concepts.

### Active Jobs

Top-level visible area for queued/running/failed/cancel-requested jobs.

Each job card should show:

- job type: eval or A/B comparison.
- workspace name, if any.
- provider and model.
- mode: tuning or release review.
- filters summary.
- case count.
- status.
- progress, such as `17/44 completed`.
- failed infrastructure count.
- started and last updated time.
- actions: cancel, retry failed, resume, view details.

Running metrics should be labeled provisional. They must not drive release approval.

### Run Results

Completed `AICheckEvalRun` artifacts only.

This area can show:

- pass rate.
- passed cases.
- failure categories.
- release gate.
- release decision.
- failed model-behavior cases.

It should not show running jobs as normal run results.

### Workspaces

Workspaces are PM experiment contexts.

They should show:

- active linked jobs.
- linked completed runs.
- linked comparisons.
- linked suggestions.
- linked release decisions.
- linked promotions.

When a job is started from a selected workspace, the job should automatically carry `experimentId` and be shown inside that workspace. Completion should automatically link the finalized run or comparison back to the workspace.

## Refresh and Polling

Automatic polling is required for active jobs.

Recommended default:

- Poll every 2 seconds while PM Review is visible and there is at least one active job.
- Stop polling when there are no active jobs.
- Refresh immediately after create/start/cancel/retry/resume.
- Show `Last updated` so the PM can tell whether the panel is live.
- Keep a manual refresh button as a fallback for completed artifacts and debugging.

Manual refresh is not a substitute for the job model. It only helps after a job has already persisted new state.

## Holdout and Release Safety

Holdout privacy rules still apply:

- Tuning-mode running jobs may show aggregate progress but must not reveal Holdout case titles, detailed failure reasons, or Textual Gradient inputs.
- Release-review mode may show controlled Holdout failure summaries.
- Partial/running Holdout results must never be used for release approval.

Release approval is allowed only when:

- job is completed.
- run artifact exists.
- run mode and dataset rules satisfy release review requirements.
- no infrastructure failure contaminated the job.

## Prompt A/B Workflow

Candidate Prompt A/B should run as a parent workflow:

```text
PromptComparisonWorkflow
  -> baseline EvalJob
  -> candidate EvalJob
  -> finalize AICheckPromptComparison
```

Rules:

- Both child jobs use the same selected case snapshots and filters.
- Baseline and candidate runs are finalized as normal completed runs.
- If either child job fails for infrastructure reasons, the workflow fails and no comparison artifact is created.
- If either child job is cancelled, the parent workflow is cancelled.
- Textual Gradient and promotion can only consume completed comparison artifacts.

## Implementation Strategy

### Phase 1: Durable Job Foundation

- Add generated or shared job types.
- Add `evalJobs`, `evalJobCaseStates`, and `promptComparisonWorkflows` IndexedDB stores.
- Add job CRUD functions in review storage.
- Add job list/detail APIs.
- Keep current completed run/result artifacts unchanged.

### Phase 2: Single Eval Job Runner

- Extract single-case eval runner.
- Add external `AbortSignal` support to provider calls.
- Snapshot cases on job creation.
- Persist per-case state after each case.
- Finalize completed jobs into existing `AICheckEvalRunSummary`.
- Keep provider-mode concurrency at 1 first.

### Phase 3: Product UI

- Replace blocking `runningEval` UX with active job cards.
- Add polling.
- Add cancel, retry, resume.
- Show failed jobs and infrastructure errors.
- Keep completed run history separate.
- Auto-link jobs and finalized artifacts to workspaces.

### Phase 4: Bounded Parallelism and Resume

- Add provider execution policy.
- Add bounded concurrency.
- Add lease expiry and resume.
- Add service-worker restart recovery.
- Add data-reset protection for active jobs.

### Phase 5: Prompt Comparison Workflow

- Convert A/B comparison to parent workflow plus child eval jobs.
- Finalize `AICheckPromptComparison` only after both runs complete.
- Update UI to show baseline and candidate progress side by side.

## Validation Strategy

Unit and integration coverage should include:

- 44-case provider eval does not require frontend request to stay open.
- UI sees job immediately after `Run Eval`.
- UI polling shows progress without reload.
- each completed case persists job-local result.
- completed job finalizes into exactly one run and one result per case.
- provider timeout produces failed job, not completed release evidence.
- model assertion failure produces completed result and failed metric.
- cancel stops queued and running cases.
- retry failed infrastructure cases before finalization.
- service-worker restart resumes stale jobs by lease.
- case edits after job creation do not affect resumed execution.
- duplicate resume does not duplicate results.
- A/B parent workflow creates comparison only after both child jobs finalize.
- tuning-mode Holdout details stay hidden while job is running.
- release decision is disabled for running, failed, cancelled, or partial jobs.
- `data/deleteAll` cannot leave old runner writes behind.

## Open Product Decisions

Locked:

- Infrastructure failures after retry should fail the job and should not generate a completed run artifact.
- Running metrics are provisional and cannot enter Release Gate.
- A/B comparison is a parent workflow over two child eval jobs.
- Completed artifacts remain the only evidence consumed by release and promotion.

Still open:

- Exact default provider concurrency per provider after initial `maxConcurrency = 1`.
- Whether failed jobs should support retry-all or only retry-failed-cases in the first UI slice.
- Whether active job cards should be global across all workspaces or scoped by selected workspace with a global active count.

