# 2026-05-22 AI Check Contract SSOT Design

Related docs:

- Progress: [2026-05-22-ai-check-contract-ssot-progress.md](2026-05-22-ai-check-contract-ssot-progress.md)
- Issues: [2026-05-22-ai-check-contract-ssot-issues.md](2026-05-22-ai-check-contract-ssot-issues.md)
- Contract version boundaries: [2026-05-21-ai-check-contract-version-boundaries-design.md](2026-05-21-ai-check-contract-version-boundaries-design.md)
- Evaluation schema V2: [2026-05-21-ai-check-evaluation-schema-v2-design.md](2026-05-21-ai-check-evaluation-schema-v2-design.md)
- PM Review workspace: [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

2026-05-24 update: the contract now includes `datasetTypes`, `provenanceTypes`, and `severityLevels`; root-level case `source` has been removed from the current Evaluation Case schema.

## Product Intent

AI Check must have one global source of truth for prompt-visible schema, runtime parser expectations, PM Review schema reference, evaluation fixtures, and regression runner semantics.

The canonical source is:

```text
apps/extension/src/shared/ai-check-contract.json
```

`types.ts` is not the source of truth for AI Check contracts. TypeScript types are compile-time projections of the contract. They should be generated from the contract or re-export generated contract types.

The goal is to stop fixing drift field by field. A schema/version change should flow through one path:

```text
ai-check-contract.json
  -> contract validator
  -> generated TypeScript types and constants
  -> generated or validated runtime schemas
  -> prompt builder, parser, PM Review, fixtures, eval runner
```

## Current Drift Problem

The current implementation still has several manually maintained surfaces:

- `ai-check-contract.json` stores versions, enums, examples, PM Review field references, prompt schema, and session policy.
- `types.ts` manually defines `CheckpointDecision`, `AICheckCase`, enum unions, and eval expectation types.
- `checkpoint-schema.ts` manually validates provider output.
- `eval-ai-check.mjs` manually validates Evaluation Case fixtures and interprets expectations.
- PM Review renders schema reference from contract field lists and examples.
- Eval fixtures store their own versions and expected output fields.
- Docs include schema snippets that can become stale.

This is why a field can exist in `types.ts` and fixtures while missing from the PM Review schema reference.

## Single Source Boundary

The AI Check contract owns:

- current prompt, output schema, and evaluation schema versions.
- historical prompt, output schema, and evaluation schema registry entries.
- enum values for AI decisions, decision reason categories, memory behavior categories, strictness levels, case statuses, dataset/provenance/severity types, and AI Check PM Review error types.
- session policy values such as `maxAssistantTurns` and `maxSessionSeconds`.
- input schema for Evaluation Cases and provider replay context.
- model output schema.
- evaluation schema, including `AICheckCase` envelope and `eval.expectedOutput`.
- prompt-facing output schema and schema summary.
- PM Review field documentation.
- examples for input, output, and evaluation case shapes.

Provider metadata remains outside this contract:

```text
apps/extension/src/shared/provider-config.json
```

Provider config owns base URLs, default models, model allowlists, and eval environment key names.

## Contract File Shape

The contract should use a schema DSL as the only machine-readable field structure:

```ts
interface AICheckContract {
  id: string;
  current: {
    promptVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
  };
  versionRegistry: {
    prompts: VersionEntry[];
    outputSchemas: VersionEntry[];
    evaluationSchemas: VersionEntry[];
  };
  enums: AICheckEnumRegistry;
  sessionPolicy: AICheckSessionPolicy;
  schemas: {
    input: ContractSchemaNode;
    output: ContractSchemaNode;
    evaluation: ContractSchemaNode;
  };
  examples: {
    input: unknown;
    output: unknown;
    evaluation: unknown;
  };
  pmReview: {
    fieldDocs: Record<string, AICheckFieldDoc>;
    commonTags: string[];
    caseSets: AICheckCaseSetDefinition[];
    errorTypes: AICheckBadCaseErrorTypeDefinition[];
  };
}
```

`schemas` owns shape, field types, requiredness, enum references, nullability, numeric ranges, and child fields. `examples` owns example payloads. `pmReview.fieldDocs` owns field explanations keyed by schema path.

`sections.input`, `sections.output`, and `sections.evaluation` are compatibility projections for PM Review and prompt building. They must be generated from `schemas`, `examples`, and `pmReview.fieldDocs`; they should not be authored by hand in `ai-check-contract.json`.

## Contract Schema DSL

Each schema node should be explicit enough to generate field references, prompt-facing schema, schema summaries, and validators:

```ts
type ContractSchemaNode =
  | { type: "string"; required: boolean; nullable?: boolean }
  | { type: "number"; required: boolean; nullable?: boolean; min?: number; max?: number }
  | { type: "boolean"; required: boolean }
  | { type: "enum"; required: boolean; enum: keyof AICheckEnumRegistry }
  | { type: "array"; required: boolean; item: ContractSchemaNode }
  | { type: "object"; required: boolean; fields: Record<string, ContractSchemaNode> }
  | { type: "record"; required: boolean; fields?: Record<string, ContractSchemaNode> }
  | { type: "union"; required: boolean; variants: ContractSchemaNode[] };
```

The DSL describes structure only. Product logic remains handwritten where it is truly behavioral. For example:

- `decision` must be a known enum value: generated validator.
- `scores.impulse` must be 0-100: generated validator.
- `ASK_MORE` is not allowed on final turn: handwritten AI Check enforcement rule.
- `mustMention` phrase comparison: handwritten EvaluationRunner semantics.

## Generated Outputs

The contract generator should produce:

```text
apps/extension/src/shared/ai-check-contract.generated.ts
```

The generated file should include:

- literal enum arrays.
- TypeScript union types derived from enum arrays.
- `AICheckCaseInput`, `CheckpointDecision`, `AICheckCaseOutput`, `AICheckExpectedOutput`, `AICheckCaseEval`, and `AICheckCase`.
- current version constants.
- session policy constants.
- output prompt schema and schema summary generated from `schemas.output`.
- schema reference sections generated from schema paths, examples, and `pmReview.fieldDocs`.
- runtime shape validators generated from `schemas.output` and `schemas.evaluation`.
- path helpers used by validator and PM Review.

`apps/extension/src/shared/types.ts` should not manually define AI Check contract types once generation exists. It should either re-export generated AI Check types or keep only non-contract app types.

## Validation Outputs

The contract validator should run before typecheck and eval:

```text
scripts/validate-ai-check-contract.mjs
```

It should verify:

- `current.promptVersion` exists in `versionRegistry.prompts`.
- `current.outputSchemaVersion` exists in `versionRegistry.outputSchemas`.
- `current.evaluationSchemaVersion` exists in `versionRegistry.evaluationSchemas`.
- enum arrays are non-empty and contain no duplicates.
- `schemas.output` can produce every output field reference shown in PM Review.
- `schemas.evaluation` can produce every evaluation field reference shown in PM Review.
- output example validates against the output schema.
- evaluation example validates against the evaluation schema.
- `eval.expectedOutput` is an output-shaped evaluation mirror.
- fixtures use known versions.
- default eval fixtures use current versions unless explicitly marked legacy or archived.

## Runtime Consumption Rules

Runtime code should consume generated contract exports:

- `prompt.ts` reads generated output prompt schema, schema summary, examples, and enum lists.
- `checkpoint-schema.ts` runs generated output shape validation before applying handwritten normalization and enforcement constraints.
- `ai-check-session-service.ts` reads generated current versions and session policy.
- `context-builder.ts` reads generated current versions for replay input.
- `review-store.ts` reads generated case statuses, dataset/provenance types, current versions, and evaluation defaults.
- `ReviewPage.tsx` reads generated schema reference sections, examples, version registry entries, common tags, and case sets.
- `eval-ai-check.mjs` runs generated evaluation case validation before applying handwritten expectation comparison semantics.

No runtime code should duplicate AI Check output schema strings, enum lists, case statuses, version names, or PM Review field docs.

## Fixture Rules

Evaluation fixtures remain authored data, not generated data. They must still be validated against the generated evaluation schema.

Default eval runs should include:

- active current-version cases.
- `status = "ready"` plus the selected `datasetType` depending on the suite.
- no archived cases.

Legacy runs should be explicit and should report which prompt, output schema, and evaluation schema versions were used.

## CI Gate

The final workflow should include:

```bash
npm --workspace apps/extension run generate:ai-check-contract
git diff --exit-code apps/extension/src/shared/ai-check-contract.generated.ts
npm --workspace apps/extension run validate:ai-check-contract
npm --workspace apps/extension run test:ai-check
npm --workspace apps/extension run eval:ai-check
npm run typecheck
```

The important invariant is that generated files must be reproducible from `ai-check-contract.json`. CI should fail if generated files are stale or if a derived surface no longer matches the contract.

## Migration Strategy

### Phase 0: Lock Current Drift

- Keep the current contract file as the canonical source.
- Add drift tests for known weak spots, especially version fields and schema reference paths.
- Keep patch-level fixes narrow while the generator does not exist.

### Phase 1: Add Contract Schema and Validator

- Define the contract file shape.
- Validate version registry, enum duplication, required sections, examples, and field paths.
- Validate existing fixtures against the current evaluation schema.
- Move field shape into `schemas`.
- Move example payloads into `examples`.
- Move PM Review prose into `pmReview.fieldDocs`.

### Phase 2: Generate TypeScript Types and Constants

- Generate AI Check enum unions, case types, output types, expected-output types, and constants.
- Make `types.ts` re-export generated AI Check contract types.
- Keep app-only types in handwritten files.
- Generate PM Review `sections` from schema paths.
- Generate output prompt schema and schema summary from `schemas.output`.

### Phase 3: Move Parser and Eval Runner to Generated Schemas

- Make provider output parsing use generated output validators and enum arrays.
- Make EvaluationRunner validate cases against generated evaluation schema before running comparisons.
- Keep product-specific comparison logic handwritten only where it expresses behavior, not schema shape.

### Phase 4: Generate PM Review Schema Reference

- Render PM Review schema reference from generated sections.
- Remove manually maintained field lists when schema node docs can generate them.
- Keep examples in contract and validate them against generated schemas.

### Phase 5: Enforce in CI

- Add generate and validate scripts to default checks.
- Fail if generated files are stale.
- Fail if runtime prompt, parser, PM Review, fixtures, or eval runner drift from contract.

## Non-Goals

- Do not move provider model metadata into the AI Check contract. Provider metadata belongs in `provider-config.json`.
- Do not generate PM Review visual layout from the contract. The contract provides data and schema reference; React components still own layout.
- Do not generate all evaluation scoring behavior. The schema should define expectation fields, while the runner owns comparison behavior for those fields.
- Do not hard-delete legacy cases. Archive or run them in explicit legacy mode.
