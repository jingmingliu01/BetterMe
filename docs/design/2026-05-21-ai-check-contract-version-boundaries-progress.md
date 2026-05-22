# 2026-05-21 AI Check Contract Version Boundaries Progress

Related docs:

- Design: [2026-05-21-ai-check-contract-version-boundaries-design.md](2026-05-21-ai-check-contract-version-boundaries-design.md)
- Issues: [2026-05-21-ai-check-contract-version-boundaries-issues.md](2026-05-21-ai-check-contract-version-boundaries-issues.md)
- PM Review workspace progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- AI Check case schema progress: [2026-05-20-ai-check-case-schema-progress.md](2026-05-20-ai-check-case-schema-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

The version-boundary cleanup is implemented. Second-phase version indexing is now in place through `current` and `versionRegistry`.

## Target State

- Contract exposes `promptVersion`, `outputSchemaVersion`, and `evaluationSchemaVersion`.
- Contract exposes `current` as the active prompt/output/evaluation version pointer.
- Contract exposes `versionRegistry` so historical prompt, output schema, and evaluation schema versions can be retained.
- Evaluation cases carry the same three version fields.
- PM Review shows Prompt, Output Schema, Evaluation Schema, and Session.
- PM Review version controls read from the registry and can switch schema references when multiple versions exist.
- Eval runner validates current-version fixtures against the renamed fields.
- No runtime code depends on ambiguous `schemaVersion` or `rubricVersion` names.

## Work Log

2026-05-21:

- Created this design/progress/issues set to make the version-boundary decision durable before implementation.
- Renamed contract and fixture metadata from `schemaVersion` / `rubricVersion` to `outputSchemaVersion` / `evaluationSchemaVersion`.
- Renamed the evaluation schema value from `strictness-rubric-v1` to `ai-check-evaluation-v1`, then advanced it to `ai-check-evaluation-v2` for output-shaped expected-output assertions.
- Updated PM Review, eval runner output, runtime session snapshots, eval case defaults, and linked docs to use Prompt, Output Schema, Evaluation Schema, and Session.
- Renamed the strictness eval fixture file from `strictness-rubric.json` to `strictness-behavior.json`.
- Added `current` and `versionRegistry` to the shared AI Check contract.
- Updated runtime round snapshots and eval runner version checks to read the active version pointer from `current`.
- Updated PM Review Contract Manual version controls to read prompt, output schema, and evaluation schema options from `versionRegistry`.
- Updated Output and Evaluation Contract Manual tabs to render schema on the left and examples on the right.

## Validation Plan

- `npm run typecheck`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check`
- `npm run build`
- `rg -n "evaluationSchemaVersion|outputSchemaVersion|AI_CHECK_SCHEMA_VERSION|AI_CHECK_RUBRIC_VERSION" apps/extension/src apps/extension/scripts apps/extension/evals`

## Update Checklist

When this progress doc changes, check:

- Design doc: did the version-boundary model change?
- Issues doc: should ambiguity or migration risks be opened or closed?
