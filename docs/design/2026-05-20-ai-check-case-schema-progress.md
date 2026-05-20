# 2026-05-20 AI Check Case Schema Progress

Related docs:

- Design: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- Issues: [2026-05-20-ai-check-case-schema-issues.md](2026-05-20-ai-check-case-schema-issues.md)
- AI review/eval loop progress: [2026-05-18-ai-review-eval-loop-progress.md](2026-05-18-ai-review-eval-loop-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

The hard migration to the unified case schema is implemented.

## Completed In This Slice

- Added explicit `DecisionReasonCategory` and `BehaviorReasonCategory` aliases.
- Added unified `AICheckCase` shape with `input`, optional `output`, and optional `eval`.
- Removed the legacy `AICheckEvalCase` type.
- Updated the runtime system prompt with category-family meaning, mapping rubric, and independent 0-100 score contract.
- Added parser validation for missing, non-finite, or out-of-range model scores.
- Added one provider repair retry for schema-validation failures.
- Updated `eval:ai-check` to accept only unified `{ input, output?, eval }` cases.
- Updated PM bad-case conversion to write the new `{ input, eval }` eval case shape.
- Migrated all 42 built-in JSON eval fixtures to the unified shape.
- Renamed runtime provider output fields to `decisionReasonCategory` and `memoryUpdate.behaviorReasonCategory`.
- Removed old `DELAY` / `delaySeconds` provider-output compatibility.
- Bumped IndexedDB to version 6 and clear old AI Check, review, and eval history stores on upgrade.

## Validation Status

Latest validation:

- `npm --workspace apps/extension run typecheck`
- `npm --workspace apps/extension run build`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check` passed 42/42 in mock mode
- `npm --workspace apps/extension run test:e2e`

## Next Steps

- Add persisted provider eval run history before relying on provider-mode evals for release gating.
- Consider a small UI affordance that shows `input`, `output`, and `eval` as separate panels in the AI PM Review Workspace.
