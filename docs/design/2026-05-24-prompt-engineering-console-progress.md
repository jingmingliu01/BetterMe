# 2026-05-24 Prompt Engineering Console Progress

Related docs:

- Design: [2026-05-24-prompt-engineering-console-design.md](2026-05-24-prompt-engineering-console-design.md)
- Issues: [2026-05-24-prompt-engineering-console-issues.md](2026-05-24-prompt-engineering-console-issues.md)
- PM Review workspace progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- AI Check contract SSOT progress: [2026-05-22-ai-check-contract-ssot-progress.md](2026-05-22-ai-check-contract-ssot-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Planning fixed. No implementation changes have been made for this design topic yet.

This document set captures the final high-level Prompt Engineering Console plan after product review and sub-agent cross-review. It should be used as the scaffold for future implementation.

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
- Current History detail shows transcript, latest decision JSON, strictness, actual decision, and turn count.
- Bad-case marking with expected decision, error types, and reviewer note.
- Bad-case conversion into an Evaluation Case.
- `AICheckCase` schema with `input`, optional `output`, `eval`, `status`, and archive metadata.
- Built-in eval fixtures under `apps/extension/evals/ai-check-cases`.
- Local `eval:ai-check` runner with status/tag filtering and provider-mode reuse of runtime provider messages.
- `evalRuns` and `evalResults` IndexedDB stores exist, but are not wired into UI or CLI run history.
- Contract-derived Schema Reference / Contract Manual exists for provider messages, output, and evaluation.

## Confirmed Gaps

- Decision Point is not yet a first-class persisted object.
- Review UI selects the latest decision, not an arbitrary decision point.
- BadCaseReview currently stores whole-session messages, which can include future turns relative to a selected failed decision.
- Conversion to eval currently derives `assistantTurnCount` from all assistant messages and fixes `isFinalTurn` to false.
- Conversion reloads current pattern memory instead of using original round snapshot memory.
- Built-in fixture cases and local editable eval cases are not unified in the UI.
- Dataset split does not exist; `status = regression` currently mixes lifecycle and release-gating purpose.
- Experiment Run exists only as CLI output, not as a persisted product object.
- Release Gate exists only as convention, not as product workflow.

## Planned Phases

### Phase 1: Decision-Point Review Foundation

Status: not started

Scope:

- Add decision-point timeline to History/Review.
- Let PM select a specific decision point before marking bad case.
- Split Model Output from Stored Decision Record in UI.
- Build selected decision-point snapshot from original session data.
- Convert selected decision point into eval case without future turns.
- Preserve actual output in converted eval case.
- Treat `AI_COOLDOWN` as terminal in docs, eval semantics, and product messaging.

### Phase 2: Ideal Case Model and Dataset Split

Status: not started

Scope:

- Update evaluation schema for `datasetType`, `provenance`, and optional `lineage`.
- Remove `bad_case_review` from case source semantics.
- Use `provenance.type = "review"` for cases created through PM review.
- Separate lifecycle `status` from dataset membership.
- Reclassify existing fixtures into design/regression/holdout according to PM intent.
- Define holdout limited-visibility behavior.

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

Planning validation performed:

- Reviewed current PM Review information architecture.
- Reviewed `AICheckCase`, `BadCaseReview`, `CheckpointDecision`, and eval runner boundaries.
- Cross-reviewed plan with product, data-model, eval-runner, and runtime/turn-level perspectives.
- Confirmed no code changes were made in this planning step.

Pending implementation validation:

- `npm --workspace apps/extension run check:ai-check-contract`
- `npm --workspace apps/extension run typecheck`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check`
- `npm --workspace apps/extension run test:e2e`
- Browser smoke check for Review/Case/Experiment UI slices.

## Synchronization Note

2026-05-24:

- Created Prompt Engineering Console design/progress/issues docs.
- Locked product decisions from review: no legacy data constraint, one eval case per decision point, future turns excluded, `AI_COOLDOWN` terminal, dataset type independent from status, Candidate Prompt A/B and Textual Gradient deferred to second Experiment Lab step.
- Older PM Review docs were checked for structure and current implementation status. They were not edited because this document set defines the future scaffold and no implementation status changed in the existing PM Review workspace.

## Update Checklist

When this progress doc changes, check:

- Design doc: did the operating model, phases, or locked decisions change?
- Issues doc: should risks or blockers be added, closed, or reprioritized?
- PM Review workspace docs: did implementation status change in the existing workspace?
- AI Check contract docs: did schema/source/version rules change?

