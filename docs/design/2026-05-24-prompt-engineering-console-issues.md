# 2026-05-24 Prompt Engineering Console Issues

Related docs:

- Design: [2026-05-24-prompt-engineering-console-design.md](2026-05-24-prompt-engineering-console-design.md)
- Progress: [2026-05-24-prompt-engineering-console-progress.md](2026-05-24-prompt-engineering-console-progress.md)
- PM Review workspace issues: [2026-05-20-pm-review-workspace-issues.md](2026-05-20-pm-review-workspace-issues.md)
- AI Check contract SSOT issues: [2026-05-22-ai-check-contract-ssot-issues.md](2026-05-22-ai-check-contract-ssot-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Decision Point is not first-class

Status: mostly mitigated

Risk:

- PM Review can only reliably orient around whole sessions or the latest decision.
- Future turn-level evals may be reconstructed from timestamps and message order instead of exact runtime input.
- Review and eval can drift from the provider request that was actually sent.

Expected behavior:

- Every reviewed model decision is represented as a decision point.
- Decision point includes round snapshot, visible conversation before the model response, turn context, actual output, and stored decision metadata.
- PM can select any decision point in a session for review.

Mitigation:

- Add decision-point timeline to Review.
- Add or derive `AICheckDecisionPointSnapshot`.
- Prefer persisting input snapshots near decision creation when implementation reaches runtime changes.

Update 2026-05-24:

- Review now exposes selectable decision points and separates model output JSON from stored decision record.
- Runtime now persists decision-point snapshots when provider decisions are created.
- Review falls back to deterministic derivation for older sessions.
- Remaining polish is making persisted-vs-derived snapshot source visible in the UI if needed.

### ISSUE-002: BadCase conversion can include future turns

Status: mostly mitigated

Risk:

- If turn 2 should have blocked but turns 3 and 4 happened, current whole-session conversion can produce an eval that tests the wrong context.
- Regression cases can learn the wrong behavioral boundary.

Expected behavior:

- Converted eval input includes only messages visible before the selected decision point.
- Selected assistant output and future turns stay in provenance/review audit context, not in replayable input.

Mitigation:

- Require PM to select a decision point before converting.
- Build eval input from selected decision-point snapshot.
- Add test coverage proving future turns are excluded.

Update 2026-05-24:

- New BadCaseReview records store selected decision-point input snapshots.
- Conversion uses the stored input snapshot and excludes future turns for newly created reviews.
- Focused automated coverage now proves selecting turn 2 excludes turn 3+ from eval input.

### ISSUE-003: AI_COOLDOWN semantics need to be terminal

Status: mostly mitigated

Risk:

- Runtime, docs, PM Review, and evals can disagree about whether `AI_COOLDOWN` pauses and resumes the same round or ends the decision point.
- Release gates can treat cooldown cases inconsistently.

Expected behavior:

- `AI_COOLDOWN` is terminal in product and release-gating semantics.
- Eval cases with expected `AI_COOLDOWN` should not expect later turns in the same round.
- Docs and UI should describe it as a terminal decision.

Mitigation:

- Update runtime/session-state docs and PM Review wording during implementation.
- Audit runtime behavior before changing enforcement if needed.
- Add eval cases for AI cooldown terminal behavior.

Update 2026-05-24:

- Product decision remains locked: `AI_COOLDOWN` is terminal.
- Runtime now resolves completed AI cooldowns to terminal completed sessions instead of returning to the same round.
- Block page copy now describes AI cooldown as ending the checkpoint.
- E2E covers that an expired AI cooldown cannot reopen the same checkpoint.
- Dedicated fixture coverage for more AI cooldown policy variants can still be added.

### ISSUE-004: Status and dataset purpose are mixed

Status: mostly mitigated

Risk:

- `status = regression` mixes lifecycle and release-gating purpose.
- Adding holdout as another status would repeat the same modeling error.
- Filters and release gates can become hard to reason about.

Expected behavior:

- Lifecycle status controls editability/readiness/archive state.
- Dataset type controls experiment purpose.
- `datasetType = design | regression | holdout` is separate from `status = draft | ready | archived`.

Mitigation:

- Update evaluation schema to add `datasetType`.
- Remove release-gating meaning from lifecycle status.
- Update case filters and eval runner to support dataset filtering.

Update 2026-05-24:

- Evaluation schema v3 separates `datasetType = design | regression | holdout` from `status = draft | ready | archived`.
- Built-in fixtures now use `status = ready` with `datasetType = regression`.
- Eval runner supports dataset filters.
- Experiment Lab now exposes dataset controls and separates tuning mode from release review mode.

### ISSUE-005: Source mixes provenance and workflow

Status: mostly mitigated

Risk:

- `bad_case_review` as a case source makes a PM review workflow look like a factual origin.
- Source cannot clearly represent authored cases, real-session evidence, and case-to-case derivation.

Expected behavior:

- `provenance` explains where the case came from.
- `lineage` explains optional case-to-case derivation.
- `BadCaseReview` remains a review artifact, not a source value.

Mitigation:

- Replace `source` with required `provenance`.
- Add optional `lineage`.
- Use `provenance.type = "review"` for PM-reviewed cases.

Update 2026-05-24:

- `AICheckCase.source` was removed from the contract and generated types.
- `provenance` is required and `lineage` is optional.
- PM-reviewed conversions use `provenance.type = "review"` with review/session/decision ids.

### ISSUE-006: Experiment results are not productized

Status: partially mitigated

Risk:

- Eval output remains CLI-only and cannot support PM-friendly experiment review.
- Release decisions cannot be audited inside the product.
- Existing `evalRuns` and `evalResults` stores stay unused.

Expected behavior:

- Experiment runs and results are persisted.
- PM Review can show run history, metrics, failed cases, and release gate summary.
- CLI and UI use the same run/result model.

Mitigation:

- Extend eval run/result schema.
- Wire eval runner to persist results where appropriate.
- Add read-only run history before adding full Experiment editor.

Update 2026-05-24:

- Experiment Lab now persists mock-mode and provider-mode current Prompt Program runs and per-case results locally.
- PM Review shows run history, metrics, failed cases, and release gate summary.
- Provider-mode UI runs now use saved BYOK keys, provider-config model allowlists, runtime provider messages, and the shared parser/validator.
- PM Review now stores first-slice Release Decisions against selected runs, including approve/block, gate status, metrics, provider/model, versions, and PM note.
- CLI runner now writes the same `AICheckEvalRunSummary` run/result artifact used by PM Review, and Experiment Lab can import it into local run history.
- Candidate Prompt promotion remains open.

### ISSUE-007: Candidate Prompt A/B can cause scope creep

Status: partially mitigated

Risk:

- Adding candidate prompt experiments too early can force premature Prompt Program storage and editor design.
- The team may optimize prompts before decision-point case conversion and dataset split are reliable.

Expected behavior:

- First Experiment Lab slice runs current Prompt Program only.
- Candidate Prompt A/B is explicitly second-step scope.

Mitigation:

- Phase 3 excludes candidate prompts.
- Phase 4 adds candidate arms after persisted runs, metrics, and release gate are stable.

Update 2026-05-24:

- Candidate Prompt A/B is implemented as a narrow Phase 4 first slice using separate Prompt Candidate and Prompt Comparison artifacts.
- Standard `AICheckEvalRun` rows remain the persisted run unit; comparison artifacts link one baseline run and one candidate run.
- Candidate runs require a BYOK provider and append the candidate patch in a `<candidate_prompt_patch>` block.
- Promotion is intentionally separate: a candidate can replace the active local Prompt Program only through a PM action that writes a Prompt Promotion audit record.
- Promotion requires passing Design, Regression, and Holdout dataset coverage.
- New AI Check sessions freeze the active promoted prompt version and use the promoted patch in provider messages.

### ISSUE-008: Textual Gradient can overfit visible cases

Status: partially mitigated

Risk:

- LLM-generated failure diagnosis can overfit regression cases.
- PM may treat generated prompt edits as automatically safe.
- Holdout can be contaminated if failure details are exposed during prompt tuning.

Expected behavior:

- Textual Gradient produces diagnosis and candidate direction only.
- It cannot directly overwrite the current Prompt Program.
- Holdout remains protected from routine prompt tuning.

Mitigation:

- Require candidate prompt experiments to pass Design, Regression, and Holdout gates.
- Hide or limit Holdout details during daily tuning.
- Store textual gradient notes separately from release decisions.

Update 2026-05-24:

- Textual Gradient now exists as diagnosis inside Prompt Comparison artifacts.
- It summarizes failure clusters, suggested directions, and risk notes, but does not mutate prompts or approve releases.
- Holdout visibility rules from Experiment Lab still apply because candidate comparison is built from standard tuning/release-review eval runs.
- Promotion requires the comparison recommendation to be `promote_candidate`, zero regressed cases, a non-failing candidate release gate, and passing Design/Regression/Holdout coverage.
- LLM-assisted candidate generation remains open.

### ISSUE-009: Contract Reference can become stale if Prompt Program expands

Status: open

Risk:

- If Prompt Program includes policy, rubric, examples, validator, and fallback, Contract Reference can lag behind runtime.
- PMs may review cases against outdated policy explanations.

Expected behavior:

- Contract Reference reflects the full Prompt Program contract.
- Provider message preview, input schema, output schema, evaluation schema, policy, and versions remain generated from shared sources where possible.

Mitigation:

- Keep `ai-check-contract.json` as the starting point for schema/policy changes.
- Extend generated references when Prompt Program shape expands.
- Keep contract validation in every implementation slice.

### ISSUE-010: Holdout visibility rules are undefined

Status: mostly mitigated

Risk:

- If PM can inspect every Holdout failure during prompt tuning, Holdout stops measuring generalization.
- If Holdout is completely hidden, debugging final gate failures becomes hard.

Expected behavior:

- Holdout is available for release checks.
- Routine prompt tuning should not expose detailed Holdout failure content.
- Release validation can show aggregate metrics and controlled failure summaries.

Mitigation:

- Define Holdout visibility before Phase 2 implementation completes.
- Start with aggregate metrics only in daily Experiment Lab.
- Allow detailed Holdout inspection only through explicit release-review mode if needed.

Update 2026-05-24:

- Experiment Lab exposes dataset filtering, including holdout as a dataset type.
- Eval runs now store `mode = tuning | release_review`.
- Tuning mode hides Holdout breakdowns and failure details, leaving aggregate metrics and release gate status visible.
- Release review mode can reveal Holdout failure summaries when the PM explicitly runs that mode.
- Remaining polish: a richer release-review approval/note flow can be added later if Holdout debugging needs stronger process control.
