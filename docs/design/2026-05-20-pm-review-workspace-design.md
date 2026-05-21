# 2026-05-20 PM Review Workspace Design

Related docs:

- Progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- Issues: [2026-05-20-pm-review-workspace-issues.md](2026-05-20-pm-review-workspace-issues.md)
- AI review/eval loop: [2026-05-18-ai-review-eval-loop-design.md](2026-05-18-ai-review-eval-loop-design.md)
- AI Check case schema: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

PM Review should become the local AI quality workspace for BetterMe.

It should not only review real AI Check history. It should support the full loop:

```text
real History Case
  -> PM review marks a bad decision
  -> PM converts it into an Evaluation Case
  -> PM edits assertions, tags, and status
  -> Evaluation Case becomes a Regression Case
  -> prompt/schema/rubric changes run against regression cases
  -> failed regression cases return to PM Review
```

The workspace remains local-first and privacy-first. It should expose enough structure for PM/developer iteration without creating a cloud review workflow.

## Workspace Information Architecture

PM Review should contain three top-level areas:

- History Cases
- Evaluation Cases
- Schema Reference

History Cases are real AI Check sessions created by user behavior.

Evaluation Cases are curated `AICheckCase` records used for evaluation and regression.

Schema Reference explains the current structured model output contract and how each field affects product behavior.

## History Cases

History Cases should keep the current review job:

- list recent AI Check sessions.
- inspect transcript, decision, provider metadata, strictness, and enforcement outcome.
- mark a decision as a bad case.
- choose the expected decision.
- assign one or more error types.
- write reviewer notes.
- convert the bad case into an Evaluation Case draft.

History Cases should not be edited as eval fixtures directly. The conversion step creates a separate Evaluation Case so real history and curated regression data stay distinct.

## Evaluation Cases

Evaluation Cases should use the unified schema from [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md):

```ts
interface AICheckCase {
  id: string;
  title: string;
  source: "authored_eval" | "real_session" | "bad_case_review";
  versions: {
    promptVersion: string;
    schemaVersion: string;
    rubricVersion: string;
  };
  input: AICheckCaseInput;
  output?: AICheckCaseOutput;
  eval?: AICheckCaseEval;
  status: "draft" | "ready" | "regression" | "archived";
  archivedAt?: string;
  archivedReason?: string;
}
```

Status semantics:

- `draft`: converted or authored case that still needs PM cleanup.
- `ready`: fully specified case that can run in evals.
- `regression`: release-gating case that should run by default in regression suites.
- `archived`: hidden from normal lists and excluded from default eval/regression runs.

Archive is the only delete behavior. PM Review should not hard-delete Evaluation Cases from the UI.

## Evaluation Case Layout

Evaluation should use a three-column workspace:

```text
Case sets / filters  |  Evaluation case list  |  Selected case detail
```

Left column:

- saved case sets.
- default filters.
- tag filters.
- strictness filters.
- expected decision filters.
- status filters.
- schema/prompt/rubric version filters.
- text search.

Middle column:

- case title.
- target display.
- expected decision.
- status.
- tags.
- source.
- last eval result when available.

Right column:

- full selected case editor.
- structured `input` editor.
- structured `eval` editor.
- optional `output` viewer for provider outputs.
- archive controls.
- status controls.

When no case is selected, the right column should show a concise empty state instead of collapsing the layout.

## Add/Edit Evaluation Case UX

Adding an Evaluation Case should open the detail column in create mode.

Inputs should use concrete placeholders:

- title: `Over-allow vague YouTube reason in strict mode`
- target display: `youtube.com`
- user message: `I just want to watch one quick video.`
- reviewer note: `Model should ask for a time limit and exit plan instead of allowing.`
- must ask about: `time limit`
- must not say: `You are weak`
- archived reason: `Covered by a broader regression case.`

Selections should use explicit options instead of free text:

- strictness: `gentle`, `balanced`, `strict`, `monk`
- expected decision: `ALLOW`, `AI_COOLDOWN`, `ASK_MORE`, `BLOCK`
- status: `draft`, `ready`, `regression`, `archived`
- source: `authored_eval`, `real_session`, `bad_case_review`
- common tags: `over_allow`, `over_block`, `under_ask`, `unnecessary_ask`, `wrong_reason_strength`, `wrong_strictness_application`, `wrong_cooldown_duration`, `unsafe_sensitive_advice`, `bad_tone`, `schema_or_format_failure`, plus domain tags such as `work`, `school`, `social`, `video`, `nsfw`, `zh`, and strictness tags.

Free-text fields should be reserved for natural-language content and reviewer notes.

## Regression Cases

A Regression Case is an Evaluation Case with:

```text
status = regression
archivedAt = empty
```

The UI should expose a default Regression filter and a Regression case set.

Regression cases should be the default release-gating suite after eval run history exists.

## Case Sets

Case sets should start as saved filters, not separate copies of cases.

```ts
interface AICheckCaseSet {
  id: string;
  name: string;
  description: string;
  filters: {
    statuses?: Array<AICheckCase["status"]>;
    tags?: string[];
    strictness?: StrictnessLevel[];
    expectedDecisions?: AIDecision[];
    promptVersions?: string[];
    schemaVersions?: string[];
    rubricVersions?: string[];
    includeArchived?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
```

Default case sets:

- All Active Cases: non-archived cases.
- Regression Suite: `status = regression` and not archived.
- Draft Review Queue: `status = draft` and not archived.
- Sensitive Risk: non-archived cases tagged `nsfw` or `unsafe_sensitive_advice`.
- Strictness Suite: non-archived cases tagged `strictness`.

## Schema Reference

Schema Reference should be the third top-level PM Review area.

It should explain the current structured output contract:

- JSON-shaped field hierarchy.
- field name.
- type.
- required/optional.
- nullable behavior.
- one-line meaning.
- expandable details for why it is necessary.
- expandable details for product impact.
- expandable details for validation behavior.
- expandable details for common review mistakes.
- a complete example output.

This reference must stay synchronized with the runtime model output schema, parser validation, prompt contract, eval runner, and design docs.

The canonical source is `apps/extension/src/shared/ai-check-contract.json`. Prompt schema text, parser enum values, eval runner provider schema text, PM Review field reference, and schema examples should be derived from that contract instead of retyped in each module.

The same contract also owns PM Review case statuses, case sources, bad-case error types, common tags, built-in case sets, and AI Check session policy. Provider base URLs, default models, model allowlists, and eval env-key names live in `apps/extension/src/shared/provider-config.json`.

The UI should not render these fields as a flat card wall. It should render them as an expandable JSON tree:

```text
{ root object }
- decision
- userFacingMessage
- decisionReasonCategory
- unlockMinutes
- aiCooldownSeconds
- nextQuestion
- scores
  - repeatedReason
  - impulse
  - deliberateness
- memoryUpdate
  - behaviorReasonCategory
  - patternNote
```

Each tree row should show the key, type, required badge, nullable badge when relevant, and a short meaning. Expanding the row should reveal the longer PM review guidance.

The reference should also include a complete example output, starting with an `ASK_MORE` example because that case exercises nullable enforcement fields and `nextQuestion`.

The preferred implementation is a contract-first descriptor used by the UI, prompt builder, parser, eval runner, and tests:

```ts
interface AICheckSchemaFieldReference {
  path: string;
  type: string;
  required: boolean;
  nullable?: boolean;
  example?: unknown;
  meaning: string;
  whyNecessary: string;
  productImpact: string;
  validation: string;
  commonMistakes: string;
}
```

Required schema reference fields:

- `decision`
- `userFacingMessage`
- `decisionReasonCategory`
- `unlockMinutes`
- `aiCooldownSeconds`
- `nextQuestion`
- `scores.repeatedReason`
- `scores.impulse`
- `scores.deliberateness`
- `memoryUpdate.behaviorReasonCategory`
- `memoryUpdate.patternNote`

When any of these fields changes, update `ai-check-contract.json` first, then update parser constraints, TypeScript types, eval assertions, tests, and linked docs in the same change.

## AGENTS.md Policy

Project instructions should include this rule:

```text
AI Check input, output, evaluation schema fields, enum values, examples, and PM Review schema reference should come from apps/extension/src/shared/ai-check-contract.json.
Do not manually duplicate AI Check output schema strings in prompt.ts, eval-ai-check.mjs, or PM Review UI.
When changing AI Check Input, Output, or Evaluation schema, update ai-check-contract.json first, then update parser constraints, TypeScript types, eval assertions, tests, and linked design/progress/issues docs in the same change.
```

Project instructions should also include:

```text
Evaluation cases must use the unified AICheckCase { input, output?, eval? } shape.
Do not hard-delete Evaluation Cases from PM Review; archive them instead.
Regression Cases are Evaluation Cases with status = regression and no archivedAt.
```

## First Implementation Slice

The first implementation slice lands the local workspace shape without adding cloud sync or a custom case-set editor:

- `AICheckCase` has explicit `status`, `archivedAt`, and `archivedReason` fields.
- Bad Case conversion creates `draft` Evaluation Cases.
- PM Review has top-level History Cases, Evaluation Cases, and Schema Reference areas.
- Evaluation Cases use the three-column layout: built-in case sets/tag filters, case list, selected case detail.
- PM can add, edit, promote to `regression`, and archive Evaluation Cases from the UI.
- Built-in case sets start as code-defined saved filters.
- Schema Reference renders from `ai-check-contract.json` as an expandable JSON-shaped tree with a complete example output.
- Prompt, parser, eval runner, version constants, and PM Review reference share `ai-check-contract.json` instead of duplicating output schema facts.
- Eval runner excludes archived cases by default and accepts status/tag filters such as `--status=regression`.

Custom user-defined case sets, latest eval-result display per case, and stricter ready/regression validation remain later scope.

## Implementation Strategy

Phase 1: data model and persistence

- Add Evaluation Case status and archive fields.
- Add case set model as saved filters.
- Preserve unified `AICheckCase` as the only case shape.
- Make archive reversible through filters.

Phase 2: Evaluation workspace

- Add PM Review top-level area switcher.
- Build Evaluation Cases three-column layout.
- Add filters, search, and default case sets.
- Add create/edit/archive flows.
- Add status management.

Phase 3: Schema Reference

- Extract schema reference descriptor into `apps/extension/src/shared/ai-check-contract.json`.
- Render Schema Reference from the descriptor.
- Use the same descriptor in prompt, parser, eval runner, and tests.
- Add tests or checks that prevent schema reference drift.
- Update project instructions.

Phase 4: regression workflow

- Surface regression filter and regression case set.
- Show latest eval result per case once eval run history is available.
- Use regression cases as release-gating defaults.
