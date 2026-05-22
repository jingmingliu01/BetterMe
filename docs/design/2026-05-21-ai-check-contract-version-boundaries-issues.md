# 2026-05-21 AI Check Contract Version Boundaries Issues

Related docs:

- Design: [2026-05-21-ai-check-contract-version-boundaries-design.md](2026-05-21-ai-check-contract-version-boundaries-design.md)
- Progress: [2026-05-21-ai-check-contract-version-boundaries-progress.md](2026-05-21-ai-check-contract-version-boundaries-progress.md)
- PM Review workspace issues: [2026-05-20-pm-review-workspace-issues.md](2026-05-20-pm-review-workspace-issues.md)
- AI Check case schema issues: [2026-05-20-ai-check-case-schema-issues.md](2026-05-20-ai-check-case-schema-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Version labels blur output schema and evaluation schema

Status: closed

Current risk:

- PM Review shows `Schema` and `Rubric`, but the actual split is model output schema and Evaluation Case assertion schema.
- `rubricVersion` suggests a separate scoring artifact even though the current implementation uses structured eval assertions.
- New fixtures and docs can drift because it is unclear which version should change for output-shape changes versus evaluation-assertion changes.

Expected behavior:

- Contract, fixtures, runtime metadata, eval runner, PM Review, and docs use `outputSchemaVersion` and `evaluationSchemaVersion`.
- PM Review labels the version chips as `Output Schema` and `Evaluation Schema`.
- Stale `schemaVersion` and `rubricVersion` names are removed from runtime code and fixture metadata.

Resolution:

- Contract, fixtures, runtime metadata, eval runner, PM Review, and linked docs now use `outputSchemaVersion` and `evaluationSchemaVersion`.
- PM Review labels the version chips as `Output Schema` and `Evaluation Schema`.
- Stale `schemaVersion` and `rubricVersion` names were removed from runtime code and fixture metadata.

### ISSUE-002: Version content can be overwritten during future bumps

Status: closed

Current risk:

- A single active version field tells PMs what is current but does not preserve previous prompt, output schema, or evaluation schema references.
- PM Review cannot switch to older schema references if the contract only stores the latest schema content.

Expected behavior:

- `current` identifies the active prompt, output schema, and evaluation schema versions.
- `versionRegistry` preserves known versions and can hold frozen historical schema sections when a future bump changes content.
- PM Review version controls read from `versionRegistry`.

Resolution:

- Added `current` and `versionRegistry` to `apps/extension/src/shared/ai-check-contract.json`.
- Added shared TypeScript exports for prompt, output schema, and evaluation schema version entries.
- Updated PM Review to render registry-backed version controls.
- Added an `AGENTS.md` rule requiring future version bumps to preserve historical registry entries.
