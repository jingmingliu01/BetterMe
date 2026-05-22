# 2026-05-21 AI Check Contract Version Boundaries Design

Related docs:

- Progress: [2026-05-21-ai-check-contract-version-boundaries-progress.md](2026-05-21-ai-check-contract-version-boundaries-progress.md)
- Issues: [2026-05-21-ai-check-contract-version-boundaries-issues.md](2026-05-21-ai-check-contract-version-boundaries-issues.md)
- PM Review workspace: [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md)
- AI Check case schema: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- Provider message contract: [2026-05-21-ai-check-provider-message-contract-design.md](2026-05-21-ai-check-provider-message-contract-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

AI Check has three different version boundaries that should be visible and named separately:

- Prompt: how runtime provider messages are assembled and what instructions the model sees.
- Output Schema: the JSON shape the model must return and the parser validates.
- Evaluation Schema: the PM/eval assertion shape used to decide whether a case passes.

The old `schemaVersion` and `rubricVersion` names are too ambiguous. `schemaVersion` sounds like it could include both model output and eval case structure. `rubricVersion` sounds like a separate scoring document, but the current product actually uses structured evaluation assertions such as expected decisions, allowed/disallowed decisions, required ask topics, forbidden wording, cooldown ranges, and score ranges.

## Version Fields

The shared contract should expose:

```ts
interface AICheckContract {
  current: {
    promptVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
  };
  promptVersion: string;
  outputSchemaVersion: string;
  evaluationSchemaVersion: string;
  versionRegistry: {
    prompts: VersionEntry[];
    outputSchemas: VersionEntry[];
    evaluationSchemas: VersionEntry[];
  };
}
```

The top-level version fields remain as compatibility aliases during this implementation phase. New runtime code should read `current` so the active version pointer is explicit.

Evaluation cases and session snapshots should carry the same names:

```ts
versions: {
  promptVersion: string;
  outputSchemaVersion: string;
  evaluationSchemaVersion: string;
}
```

## Version Values

Current values:

- `promptVersion`: `ai-check-prompt-v4`
- `outputSchemaVersion`: `checkpoint-decision-v3`
- `evaluationSchemaVersion`: `ai-check-evaluation-v2`

The output schema value keeps the existing `checkpoint-decision-v3` lineage because it refers to the model decision payload already used by parser and fixtures. The evaluation schema value uses `ai-check-evaluation-v2` because the PM Review surface is explaining the output-shaped Evaluation Case assertion schema, not a separate human-readable scoring document.

## Version Registry

`versionRegistry` keeps the list of known prompt, output schema, and evaluation schema versions. The current entries can derive their field references and examples from `sections`. Historical entries may carry their own frozen `section` snapshot when a future version bump changes schema content.

Version bumps should not overwrite the previous version entry. The expected workflow is:

1. Keep the old version entry in `versionRegistry`.
2. Add a new version entry and mark it current.
3. Move `current` to the new version.
4. Update fixtures, parser/runtime code, PM Review, and eval runner behavior for the new current version.

## Bump Rules

Prompt version changes when:

- provider-visible system prompt text changes materially.
- provider message assembly changes materially.
- trusted round or turn context shape changes in a model-visible way.

Output schema version changes when:

- model output fields are added, removed, renamed, or retyped.
- parser-required fields or enum values change.
- output validation semantics change in a way that affects provider compatibility.

Evaluation schema version changes when:

- `AICheckCase.eval` fields are added, removed, renamed, or retyped.
- eval fixture assertion semantics change.
- the eval runner interpretation of an existing assertion field changes materially.

## PM Review Contract Manual

The version strip should show:

- Prompt
- Output Schema
- Evaluation Schema
- Session

The Output tab explains model output and parser validation. The Evaluation tab explains Evaluation Case assertion fields and how the eval runner interprets them. The UI should not use `Rubric` as the version label while the underlying artifact is an evaluation schema.

Output and Evaluation tabs should render schema on the left and the complete example on the right. Both sides should use the same dark, code-oriented reading surface so PMs compare contract shape and example shape directly.

## Implementation Strategy

1. Rename contract fields in `apps/extension/src/shared/ai-check-contract.json`.
2. Add `current` and `versionRegistry` to make active version pointers and historical version retention explicit.
3. Rename TypeScript fields and constants.
4. Migrate eval fixture metadata.
5. Update eval runner version checks and console labels.
6. Update PM Review version selectors and schema/example layout.
7. Update linked docs and validation assertions.
8. Run typecheck, AI Check logic tests, eval, build, e2e, UI smoke checks, and stale-name grep.
