# 2026-05-24 Prompt Engineering Console Progress

Related docs:

- Design: [2026-05-24-prompt-engineering-console-design.md](2026-05-24-prompt-engineering-console-design.md)
- Issues: [2026-05-24-prompt-engineering-console-issues.md](2026-05-24-prompt-engineering-console-issues.md)
- PM Review workspace progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- AI Check contract SSOT progress: [2026-05-22-ai-check-contract-ssot-progress.md](2026-05-22-ai-check-contract-ssot-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Phase 1 and Phase 2 foundation work is partially implemented in the AI Check contract, review-store conversion path, PM Review UI, eval fixtures, and eval runner.

This document set remains the scaffold for the larger Prompt Engineering Console implementation. The current code change does not yet implement Experiment Lab run history, release-gate UI, Candidate Prompt A/B, or Textual Gradient.

## Product Decisions Locked

- Legacy local PM Review data does not need to be preserved as a design constraint.
- Evaluation Case should be one decision point, not a whole session.
- When a selected turn is converted to eval, future turns after that decision point must be excluded from eval input.
- `AI_COOLDOWN` is terminal in product and release-gating semantics.
- Decision-point snapshots should be accepted as the reliable way to make review/eval reproducible.
- `datasetType` should be independent from lifecycle `status`.
- Candidate Prompt A/B and Textual Gradient are second-step Experiment Lab capabilities, not first-slice requirements.

## Already Exists

- Local PM Review page at `review.html`.
- History Cases area listing recent AI Check sessions.
- Current History detail shows transcript, selectable decision points, strictness, actual decision, turn count, model output JSON, and stored decision record.
- Bad-case marking with expected decision, error types, and reviewer note.
- Bad-case conversion into an Evaluation Case from the selected decision point.
- `AICheckCase` schema with `input`, optional `output`, `eval`, lifecycle `status`, `datasetType`, `provenance`, optional `lineage`, and archive metadata.
- Built-in eval fixtures under `apps/extension/evals/ai-check-cases`.
- Local `eval:ai-check` runner with status/tag/dataset filtering and provider-mode reuse of runtime provider messages.
- `evalRuns` and `evalResults` IndexedDB stores exist, but are not wired into UI or CLI run history.
- Contract-derived Schema Reference / Contract Manual exists for provider messages, output, and evaluation.

## Confirmed Gaps

- Decision Point is not yet a dedicated persisted store object; it is currently derived from session messages, decisions, and round snapshot data.
- Review UI can select an arbitrary decision point in the current session.
- New BadCaseReview records store a selected decision-point input snapshot that excludes future turns.
- Conversion to eval uses the stored input snapshot when present and preserves captured model output.
- New conversion uses original round snapshot pattern memory instead of reloading current pattern memory.
- Built-in fixture cases and local editable eval cases are not unified in the UI.
- Dataset split exists in the contract and fixtures; holdout visibility rules and Experiment Lab controls are still not productized.
- Experiment Run exists only as CLI output, not as a persisted product object.
- Release Gate exists only as convention, not as product workflow.

## Planned Phases

### Phase 1: Decision-Point Review Foundation

Status: partially implemented

Scope:

- Add decision-point timeline to History/Review.
- Let PM select a specific decision point before marking bad case.
- Split Model Output from Stored Decision Record in UI.
- Build selected decision-point snapshot from original session data.
- Convert selected decision point into eval case without future turns.
- Preserve actual output in converted eval case.
- Treat `AI_COOLDOWN` as terminal in docs, eval semantics, and product messaging.

Implemented now:

- History/Review shows a decision-point selector.
- PM bad-case review can target the selected decision.
- New bad-case snapshots exclude future turns from replayable eval input.
- Converted eval cases preserve captured model output when a source decision exists.

Still remaining:

- Persist a dedicated decision-point snapshot at runtime instead of deriving it during review.
- Add focused automated coverage for future-turn exclusion.
- Audit runtime/session-state wording for terminal `AI_COOLDOWN` semantics.

### Phase 2: Ideal Case Model and Dataset Split

Status: partially implemented

Scope:

- Update evaluation schema for `datasetType`, `provenance`, and optional `lineage`.
- Remove `bad_case_review` from case source semantics.
- Use `provenance.type = "review"` for cases created through PM review.
- Separate lifecycle `status` from dataset membership.
- Reclassify existing fixtures into design/regression/holdout according to PM intent.
- Define holdout limited-visibility behavior.

Implemented now:

- Evaluation schema version moved to `ai-check-evaluation-v3`.
- `datasetType`, `provenance`, and optional `lineage` are in the contract and generated types.
- `source` case semantics are removed from `AICheckCase`.
- Existing built-in fixtures are reclassified as `status = ready` and `datasetType = regression`.
- Eval runner accepts dataset filters.

Still remaining:

- Define holdout limited-visibility behavior in the product.
- Expose dataset controls in the future Experiment Lab UI.

### Phase 3: Experiment Lab First Slice

Status: not started

Scope:

- Persist eval runs and eval results.
- Show run history in PM Review.
- Add dataset and filter controls.
- Show metrics: pass rate, false allow, false block, ASK_MORE recall, schema validity, unsafe sensitive failures, reason quality.
- Add release gate summary inside Experiment Lab.
- Run current Prompt Program only.

### Phase 4: Candidate Prompt and Textual Gradient

Status: second-step scope, not started

Scope:

- Add Candidate Prompt A/B experiment arms.
- Compare current vs candidate Prompt Program.
- Add Textual Gradient diagnosis from failed cases.
- Generate prompt/rubric/schema candidate suggestions.
- Require Design, Regression, and Holdout checks before promotion.

## Validation Status

Implementation validation performed:

- `npm --workspace apps/extension run check:ai-check-contract` passed.
- `npm --workspace apps/extension run typecheck` passed.
- `npm --workspace apps/extension run eval:ai-check` passed with 42/42 cases.

Pending implementation validation:

- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run test:e2e`
- Browser smoke check for Review/Case/Experiment UI slices.

## Synchronization Note

2026-05-24:

- Created Prompt Engineering Console design/progress/issues docs.
- Locked product decisions from review: no legacy data constraint, one eval case per decision point, future turns excluded, `AI_COOLDOWN` terminal, dataset type independent from status, Candidate Prompt A/B and Textual Gradient deferred to second Experiment Lab step.
- Older PM Review docs were checked for structure and current implementation status. They were not edited because this document set defines the future scaffold and no implementation status changed in the existing PM Review workspace.

2026-05-24 implementation update:

- Began Phase 1 and Phase 2 implementation.
- Added decision-point selection and selected-decision bad-case conversion in PM Review.
- Updated AI Check evaluation schema to v3 with dataset/provenance/lineage model.
- Reclassified built-in eval fixtures to ready regression dataset cases.
- Issues document was updated because issue status changed. Design document was checked; its product direction and phase structure still apply.

## Update Checklist

When this progress doc changes, check:

- Design doc: did the operating model, phases, or locked decisions change?
- Issues doc: should risks or blockers be added, closed, or reprioritized?
- PM Review workspace docs: did implementation status change in the existing workspace?
- AI Check contract docs: did schema/source/version rules change?
