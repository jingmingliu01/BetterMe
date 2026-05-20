# 2026-05-20 AI Check Case Schema Progress

Related docs:

- Design: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- Issues: [2026-05-20-ai-check-case-schema-issues.md](2026-05-20-ai-check-case-schema-issues.md)
- AI review/eval loop progress: [2026-05-18-ai-review-eval-loop-progress.md](2026-05-18-ai-review-eval-loop-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

The first compatibility slice is implemented.

## Completed In This Slice

- Added explicit `DecisionReasonCategory` and `BehaviorReasonCategory` aliases.
- Added unified `AICheckCase` shape with `input`, optional `output`, and optional `eval`.
- Added `expectedScoreRanges` to the typed legacy eval case.
- Updated the runtime system prompt with category-family meaning, mapping rubric, and independent 0-100 score contract.
- Added parser validation for missing, non-finite, or out-of-range model scores.
- Added one provider repair retry for schema-validation failures.
- Updated `eval:ai-check` to normalize both legacy flat cases and new `{ input, eval }` cases.
- Updated PM bad-case conversion to write the new `{ input, eval }` eval case shape.

## Validation Status

Latest validation:

- `npm --workspace apps/extension run typecheck`
- `npm --workspace apps/extension run build`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check` passed 42/42 in mock mode
- `npm --workspace apps/extension run test:e2e`

## Next Steps

- Migrate built-in JSON fixtures to the new nested shape once compatibility is stable.
- Add persisted provider eval run history before relying on provider-mode evals for release gating.
- Consider a small UI affordance that shows `input`, `output`, and `eval` as separate panels in the AI PM Review Workspace.
