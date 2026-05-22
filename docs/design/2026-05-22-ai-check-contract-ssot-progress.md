# 2026-05-22 AI Check Contract SSOT Progress

Related docs:

- Design: [2026-05-22-ai-check-contract-ssot-design.md](2026-05-22-ai-check-contract-ssot-design.md)
- Issues: [2026-05-22-ai-check-contract-ssot-issues.md](2026-05-22-ai-check-contract-ssot-issues.md)
- Contract version boundaries progress: [2026-05-21-ai-check-contract-version-boundaries-progress.md](2026-05-21-ai-check-contract-version-boundaries-progress.md)
- Evaluation schema V2 progress: [2026-05-21-ai-check-evaluation-schema-v2-progress.md](2026-05-21-ai-check-evaluation-schema-v2-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Generator, schema DSL, generated PM Review sections, and generated shape validators are implemented. Runtime parser and EvaluationRunner now call generated/contract-derived shape validation before their handwritten behavioral logic.

The current codebase uses `ai-check-contract.json` as the canonical source for versions, enums, PM Review schema reference, prompt-facing output schema, examples, and session policy. `ai-check-contract.generated.ts` projects that contract into TypeScript types and constants. The validator now checks version registry consistency, enum uniqueness, PM Review field docs, examples, and fixtures.

## Completed

2026-05-22:

- Created this design/progress/issues set to define AI Check contract single-source-of-truth ownership.
- Identified `apps/extension/src/shared/ai-check-contract.json` as the canonical AI Check contract source.
- Defined generated TypeScript and validation targets.
- Updated agent instructions to treat contract-first and generated-or-validated derived surfaces as the default workflow.
- Added `scripts/generate-ai-check-contract.mjs`.
- Added generated `src/shared/ai-check-contract.generated.ts`.
- Changed `src/shared/ai-check-contract.ts` into a compatibility wrapper that re-exports generated contract exports.
- Changed `src/shared/types.ts` so AI Check contract types are re-exported from the generated contract file instead of being hand-maintained there.
- Added `scripts/validate-ai-check-contract.mjs`.
- Added `generate:ai-check-contract`, `validate:ai-check-contract`, and `check:ai-check-contract` npm scripts.
- Migrated eval fixtures to carry explicit `status: "regression"` so fixture data matches the unified `AICheckCase` envelope.
- Added validation coverage for current versions, enum duplication, output schema field paths, evaluation schema required paths, output/evaluation examples, and fixture versions.
- Moved raw contract field structure into `schemas`.
- Moved raw examples into top-level `examples`.
- Moved PM Review prose into `pmReview.fieldDocs`.
- Removed hand-authored `sections` from `ai-check-contract.json`; generated output now reconstructs `sections` for existing PM Review and prompt callsites.
- Added `scripts/ai-check-contract-shape.mjs` so generator, validator, and eval runner share schema traversal and validation logic.
- Generated `AI_CHECK_OUTPUT_PROMPT_SCHEMA`, `AI_CHECK_OUTPUT_SCHEMA_SUMMARY`, and PM Review section references from schema nodes.
- Generated runtime shape validators in `ai-check-contract.generated.ts`.
- Updated `checkpoint-schema.ts` to run generated output shape validation before normalization and enforcement constraints.
- Updated `eval-ai-check.mjs` to run contract-derived Evaluation Case shape validation before expectation comparison.

Recent related work:

- Contract version names were split into prompt, output schema, and evaluation schema versions.
- `versionRegistry` was added to preserve historical prompt, output schema, and evaluation schema entries.
- Evaluation Schema V2 moved PM expectations into `eval.expectedOutput`.
- PM Review schema reference now renders output and evaluation schema beside examples.
- AI Check logic tests have started to guard against schema reference drift.

## In Progress

- `ai-check-contract.generated.ts` still uses a generated TypeScript template for named AI Check interfaces; structural validators and PM Review sections are schema-derived.
- `checkpoint-schema.ts` still contains handwritten normalization and enforcement constraints after generated shape validation.
- `eval-ai-check.mjs` still contains handwritten expectation comparison semantics after generated shape validation.

## Remaining Work

### Phase 1: Contract Validation

- Completed for current input, output, and evaluation schemas.
- Remaining: make schema-node definitions richer if future fields need stricter generated semantics.

### Phase 2: Contract Generation

- Completed for schema reference sections, output prompt schema, schema summary, output validator, and evaluation validator.

### Phase 3: Runtime Migration

- Completed: `checkpoint-schema.ts` calls generated output validator before normalization and enforcement constraints.
- Completed: EvaluationRunner calls contract-derived evaluation validator before expectation comparison.
- Keep only behavior-specific comparison logic handwritten.
- Remove compatibility aliases once all callsites use generated current versions.

### Phase 4: CI Enforcement

- Add generate, diff, and validate checks.
- Ensure stale generated files fail CI.
- Ensure contract drift blocks eval and typecheck.

## Validation Plan

During migration:

- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Final target:

- `npm --workspace apps/extension run generate:ai-check-contract`
- `npm --workspace apps/extension run generate:ai-check-contract -- --check`
- `npm --workspace apps/extension run validate:ai-check-contract`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check`
- `npm run typecheck`

## Update Checklist

When this progress doc changes, check:

- Design doc: did SSOT ownership or migration phase ordering change?
- Issues doc: should a drift risk be opened, closed, or reclassified?
- AGENTS.md: do future-agent instructions still match the intended workflow?
