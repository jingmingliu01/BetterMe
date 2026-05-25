# 2026-05-25 Eval Job Model Issues

Related docs:

- Design: [2026-05-25-eval-job-model-design.md](2026-05-25-eval-job-model-design.md)
- Progress: [2026-05-25-eval-job-model-progress.md](2026-05-25-eval-job-model-progress.md)
- Prompt Engineering Console issues: [2026-05-24-prompt-engineering-console-issues.md](2026-05-24-prompt-engineering-console-issues.md)
- Run Review Console issues: [2026-05-25-run-review-console-issues.md](2026-05-25-run-review-console-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Provider eval can outlive frontend timeout

Status: mitigated

Risk:

- PM clicks `Run Eval`, sees "BetterMe background did not respond", and assumes no result exists.
- Background execution may still complete and save a run later.
- Reloading the extension can reveal the saved run, which makes the product feel nondeterministic.

Evidence:

- Eval execution currently uses request/response message flow.
- Frontend eval timeout is shorter than a realistic provider-mode 44-case run.
- Run/result persistence happens only after full completion.

Expected behavior:

- `Run Eval` creates a durable job immediately.
- UI shows progress without requiring reload.
- Completed results appear automatically after finalization.

Mitigation:

- Add `EvalJob` and `JobCaseState`.
- Return `jobId` immediately.
- Poll active jobs.
- Finalize completed jobs into normal run artifacts.

Update 2026-05-25:

- Experiment Lab now starts evals through `review/startEvalJob`, shows active job progress, polls while jobs are active, and finalizes completed jobs into normal run/result artifacts.

### ISSUE-002: MV3 service worker can interrupt long-running evals

Status: mitigated

Risk:

- Long eval loops that depend on in-memory state can be interrupted.
- Completed case work can be lost if it was not persisted.
- Retrying after restart can duplicate work or results.

Expected behavior:

- Every case state is persisted after completion or failure.
- Jobs have leases and can resume stale running work.
- Resume uses frozen case snapshots.
- Result writes are idempotent.

Mitigation:

- Persist job and case state in IndexedDB.
- Add lease owner and lease expiry.
- Make result ids deterministic or enforce one result per run/case at finalize.
- Resume only unfinished cases.

Update 2026-05-25:

- Eval jobs and per-case state are persisted in IndexedDB, running jobs use leases, stale running cases are reset to pending on resume, and finalized result ids are deterministic per run/case.

### ISSUE-003: Running status must not pollute completed eval artifacts

Status: mitigated

Risk:

- Adding `running`, `partial`, or `cancelled` to `AICheckEvalRun` would force all artifact consumers to understand incomplete evidence.
- Release Gate, Prompt Comparison, CLI import, and Run History could accidentally consume partial data.

Expected behavior:

- `AICheckEvalRun` and `AICheckEvalResult` remain completed evidence only.
- Running state lives only in `EvalJob` and `JobCaseState`.

Mitigation:

- Keep job stores separate from artifact stores.
- Create completed run/result artifacts only during finalize.
- Disable release decisions for non-finalized jobs.

Update 2026-05-25:

- `evalJobs` and `evalJobCaseStates` store execution state separately. `evalRuns` and `evalResults` are written only during finalize.

### ISSUE-004: Infrastructure failure semantics can be confused with model failure

Status: mitigated

Risk:

- Provider timeout, 429, invalid key, or schema transport failure could be counted as model behavior failure.
- Release decisions could be made from contaminated metrics.

Expected behavior:

- Valid provider output that fails eval assertions counts as model behavior evidence.
- Infrastructure failures after retries fail the job and do not create release-consumable run artifacts.

Mitigation:

- Add provider error taxonomy to job attempts.
- Keep failed infrastructure cases under job state.
- Require retry or new job before release review.

Update 2026-05-25:

- Provider errors are captured on job case attempts. Jobs with unrecovered infrastructure failures move to `failed` and do not create completed run evidence.

### ISSUE-005: Case drift can make resume unreproducible

Status: mitigated

Risk:

- User edits an eval case while a job is running.
- Resume later reads the edited case instead of the case that was selected for the original run.
- Run evidence becomes non-reproducible.

Expected behavior:

- Job creation freezes every selected case into `JobCaseState.caseSnapshot`.
- Resume always uses the snapshot.

Mitigation:

- Snapshot selected cases before the first provider call.
- Store selected version fields and case ids in the job request.
- Show job filters and case count from the snapshot, not from mutable current filters.

Update 2026-05-25:

- Job creation writes `caseSnapshot` for every selected case before execution starts.

### ISSUE-006: Cancellation cannot stop current provider calls

Status: mitigated

Risk:

- User clicks cancel but the current provider request keeps running until its internal timeout.
- Background promises can still write state after the user believes the job stopped.

Expected behavior:

- Cancellation is durable and observable.
- Active provider calls receive an external abort signal when possible.
- Pending cases become cancelled.
- Cancelled jobs do not produce completed run artifacts.

Mitigation:

- Add `cancel_requested` state.
- Add external `AbortSignal` support to provider client.
- Check cancellation at case boundaries and before finalize.

Update 2026-05-25:

- Eval jobs support durable cancellation, active provider calls receive an external abort signal, and cancelled jobs do not finalize run artifacts.

### ISSUE-007: Prompt A/B can produce dirty comparison semantics

Status: mitigated

Risk:

- A running comparison artifact could be mistaken for a completed comparison.
- If baseline completes and candidate fails, the system may lose baseline work or create an incomplete comparison.

Expected behavior:

- A/B execution is a parent workflow with two child eval jobs.
- `AICheckPromptComparison` exists only after both child jobs finalize.

Mitigation:

- Add `PromptComparisonWorkflow`.
- Store baseline and candidate child job ids.
- Finalize comparison only after both child `outputRunId` values exist.

Update 2026-05-25:

- Candidate A/B now starts a `PromptComparisonWorkflow` with baseline and candidate child eval jobs. `AICheckPromptComparison` is created only after both child runs finalize.

### ISSUE-008: Active jobs are not clearly tied to workspaces

Status: mitigated

Risk:

- PM sees "Regression eval" workspace and a run result, but cannot tell which action created which artifact.
- Running jobs can feel global and detached from the experiment hypothesis.

Expected behavior:

- Jobs started from a workspace carry `experimentId`.
- Workspace detail shows active jobs and finalized linked artifacts.
- Completion automatically links finalized run or comparison artifacts back to the workspace.

Mitigation:

- Add job `context.experimentId` and optional `armId`.
- Update workspace UI to show active job references.
- Link artifacts during finalize.

Update 2026-05-25:

- Jobs carry workspace context, active jobs are visible in Experiment Lab, and finalized run/comparison artifacts are auto-linked back to the selected workspace.

### ISSUE-009: Holdout details can leak through partial job UI

Status: mitigated

Risk:

- Active job progress could reveal Holdout case titles, tags, failure reasons, or Textual Gradient details in tuning mode.
- PMs could overfit to Holdout details before release review.

Expected behavior:

- Tuning mode shows aggregate Holdout progress only.
- Release review mode may show controlled Holdout failure summaries.
- Partial Holdout results never drive release approval.

Mitigation:

- Apply existing Holdout visibility rules to job progress UI.
- Redact Holdout case-level details in tuning mode.
- Gate release decisions on finalized release-review runs.

Update 2026-05-25:

- Active job UI shows aggregate progress only. Existing Holdout failure-detail and release-review guards continue to apply to finalized run and comparison artifacts.

### ISSUE-010: Local reset can race with active runners

Status: mitigated

Risk:

- `data/deleteAll` clears stores while an old runner promise is still active.
- Old provider responses write into freshly reset stores.
- Job and artifact stores become inconsistent.

Expected behavior:

- Destructive reset cancels or blocks active jobs first.
- Old runner writes are ignored after reset.

Mitigation:

- Add reset generation or active-job cancellation before delete.
- Check job existence and lease validity before each write.
- Clear job stores and artifact stores together.

Update 2026-05-25:

- Local reset now requests cancellation for active eval jobs and comparison workflows before clearing IndexedDB stores.

## Decision Blockers

Resolved:

- Infrastructure failures after retry should fail the job and should not generate completed run evidence.

Remaining follow-ups:

- Provider-specific concurrency values can be tuned beyond the conservative defaults in `provider-config.json`.
- The first UI slice retries failed cases at the job level; per-case checkboxes can be added later if needed.
- Active job cards are shown in Experiment Lab and filtered toward the selected workspace while still keeping global jobs visible.
