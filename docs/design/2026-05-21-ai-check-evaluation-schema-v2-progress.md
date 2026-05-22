# 2026-05-21 AI Check Evaluation Schema V2 Progress

Related docs:

- Design: [2026-05-21-ai-check-evaluation-schema-v2-design.md](2026-05-21-ai-check-evaluation-schema-v2-design.md)
- Issues: [2026-05-21-ai-check-evaluation-schema-v2-issues.md](2026-05-21-ai-check-evaluation-schema-v2-issues.md)
- Contract version boundaries progress: [2026-05-21-ai-check-contract-version-boundaries-progress.md](2026-05-21-ai-check-contract-version-boundaries-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Evaluation Schema V2 is implemented.

## Target State

- `evaluationSchemaVersion` is `ai-check-evaluation-v2`.
- PM Review schema reference shows the full `AICheckCase` envelope, including `versions` and lifecycle metadata.
- `eval.expectedOutput` mirrors the model Output Schema.
- PM Review stores message, score, cooldown, and memory expectations under `eval.expectedOutput`.
- EvaluationRunner reports field-path-specific failures.
- Old flat expectation fields are removed from active fixtures and runtime types.

## Work Log

2026-05-21:

- Created this design/progress/issues set before implementation.
- Updated `AI_CHECK_CONTRACT.evaluationSchemaVersion` to `ai-check-evaluation-v2`.
- Migrated active eval fixtures so `eval.expectedOutput` mirrors model output fields.
- Updated EvaluationRunner to compare actual output against field-level expected-output constraints.
- Updated PM Review eval editing to store user-facing message expectations under `eval.expectedOutput.userFacingMessage`.
- Updated contract reference docs and linked PM Review / case schema docs.
- Updated Evaluation schema reference to include `versions.promptVersion`, `versions.outputSchemaVersion`, `versions.evaluationSchemaVersion`, case source/status fields, and matching example data.
- Added AI Check logic assertions so the Evaluation schema reference cannot omit version fields or drift from the current contract versions.
- Validation passed:
  - `npm run typecheck`
  - `npm --workspace apps/extension run test:ai-check`
  - `npm --workspace apps/extension run eval:ai-check`

## Validation Plan

- `npm run typecheck`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check`
- `npm run build`
- `npm --workspace apps/extension run test:e2e`
- `rg -n "mustAskAbout|mustNotSay|expectedScoreRanges|expectedCooldownRangeSeconds|allowedDecisions|disallowedDecisions" apps/extension/evals apps/extension/scripts apps/extension/src/pages apps/extension/src/shared`
- `apps/extension/src/ai/review-store.ts` may keep those names only inside the legacy local-store normalization block.

## Update Checklist

When this progress doc changes, check:

- Design doc: did expected-output semantics change?
- Issues doc: should a blocker be opened or closed?
