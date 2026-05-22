# 2026-05-22 AI Check Contract SSOT Issues

Related docs:

- Design: [2026-05-22-ai-check-contract-ssot-design.md](2026-05-22-ai-check-contract-ssot-design.md)
- Progress: [2026-05-22-ai-check-contract-ssot-progress.md](2026-05-22-ai-check-contract-ssot-progress.md)
- Contract version boundaries issues: [2026-05-21-ai-check-contract-version-boundaries-issues.md](2026-05-21-ai-check-contract-version-boundaries-issues.md)
- Evaluation schema V2 issues: [2026-05-21-ai-check-evaluation-schema-v2-issues.md](2026-05-21-ai-check-evaluation-schema-v2-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: AI Check contract has multiple partial sources of truth

Status: closed

Current risk:

- `ai-check-contract.json` owns versions, enums, examples, prompt schema, PM Review field reference, and session policy.
- `types.ts` separately owns TypeScript shapes for AI Check output, cases, and expectation fields.
- `checkpoint-schema.ts` separately owns runtime output parsing.
- `eval-ai-check.mjs` separately owns Evaluation Case validation and expectation interpretation.
- PM Review can render schema reference content that does not fully match the actual TypeScript case shape.

Expected behavior:

- `ai-check-contract.json` is the single canonical AI Check contract source.
- TypeScript types, runtime constants, schema reference sections, and validation helpers are generated or directly validated from the contract.
- CI fails when generated files or derived surfaces drift.

Resolution plan:

Resolution:

- Contract generator has been added.
- Contract validator has been added.
- `types.ts` now re-exports generated AI Check contract types.
- Raw field shape now lives under `schemas`.
- PM Review `sections` are generated from `schemas`, `examples`, and `pmReview.fieldDocs`.
- Parser and eval runner now call generated or contract-derived shape validation before handwritten behavioral logic.

### ISSUE-002: PM Review schema reference can drift from real case shape

Status: closed

Current risk:

- PM Review reads `sections.evaluation.fields` and `sections.evaluation.example`.
- If those are manually edited separately from `AICheckCase`, the UI can omit fields such as `versions`, `status`, or lifecycle metadata.

Expected behavior:

- PM Review schema reference is generated from the same evaluation schema used to validate fixtures.
- Every displayed path exists in the evaluation schema.
- Every required case envelope field appears in the reference and example.

Resolution:

- Generate schema reference sections from contract schema nodes.
- Validate `pmReview.fieldDocs` against schema-derived paths.
- Stop reading hand-authored `sections` from the raw contract.

### ISSUE-003: TypeScript unions can drift from contract enum arrays

Status: closed

Current risk:

- `types.ts` manually defines unions such as `AIDecision`, `DecisionReasonCategory`, `BehaviorReasonCategory`, and `AICheckCaseStatus`.
- `ai-check-contract.json` manually defines the enum arrays used by prompt, parser, and PM Review.
- A change to one side may compile but behave incorrectly at runtime.

Expected behavior:

- Enum arrays are authored once in the contract.
- TypeScript union types are generated from those arrays.
- Runtime parser and PM Review use the generated arrays.

Resolution plan:

Resolution:

- Enum arrays and union types are generated into `ai-check-contract.generated.ts`.
- `types.ts` re-exports the generated AI Check enum union types instead of defining them manually.

### ISSUE-004: Output parser and EvaluationRunner still own schema shape manually

Status: closed

Current risk:

- The parser validates model output with handwritten rules.
- EvaluationRunner validates fixtures and expectation fields with handwritten logic.
- These can drift from contract examples, prompt schema, and PM Review reference.

Expected behavior:

- Parser shape validation uses generated output schema helpers.
- EvaluationRunner case validation uses generated evaluation schema helpers.
- The runner keeps handwritten comparison behavior only for semantic checks such as range matching and text inclusion.

Resolution:

- Generate runtime validators from contract schema nodes.
- Make `checkpoint-schema.ts` call the generated output validator.
- Make `eval-ai-check.mjs` call the generated evaluation validator.
- Keep comparison logic path-based and field-specific.

### ISSUE-005: Docs can repeat stale schema snippets

Status: accepted

Current risk:

- Design docs include TypeScript snippets for readability.
- Those snippets may become stale after contract changes.

Expected behavior:

- Docs explain intent, ownership, and migration rules.
- Canonical field definitions remain in `ai-check-contract.json`.
- Generated schema reference and validator output are used for exact current shapes.

Resolution plan:

- Keep docs high level unless the snippet explains a design decision.
- When exact schema snippets are included, link to the contract and update linked progress/issues docs.
