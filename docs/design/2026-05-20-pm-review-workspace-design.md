# 2026-05-20 PM Review Workspace Design

Related docs:

- Progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- Issues: [2026-05-20-pm-review-workspace-issues.md](2026-05-20-pm-review-workspace-issues.md)
- AI review/eval loop: [2026-05-18-ai-review-eval-loop-design.md](2026-05-18-ai-review-eval-loop-design.md)
- AI Check case schema: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- AI Check provider message contract: [2026-05-21-ai-check-provider-message-contract-design.md](2026-05-21-ai-check-provider-message-contract-design.md)

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
  -> prompt/output-schema/evaluation-schema changes run against regression cases
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

Schema Reference explains the current AI Check contract manual: how the runtime provider request is assembled, what the current generated System Prompt is, what structured output the model must return, and how Evaluation Cases assert expected behavior.

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
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
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
- output-schema/prompt/evaluation-schema version filters.
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
    outputSchemaVersions?: string[];
    evaluationSchemaVersions?: string[];
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

Schema Reference should be the third top-level PM Review area. The navigation label can remain `Schema Reference`, but the surface should behave like an AI Check Contract Manual rather than only a model-output field list.

The manual should help a reviewer understand four questions without reading source code:

- What are the current AI Check contract versions?
- What is the provider request, and what pieces compose the model input?
- What is the current generated System Prompt, and which parts are built from contract/runtime references?
- What are the Output and Evaluation schemas, and how do they differ?

### Contract Sources

The canonical AI Check source is `apps/extension/src/shared/ai-check-contract.json`.

The contract owns:

- prompt, output schema, and evaluation schema version identifiers.
- AI Check session policy.
- enum values used by prompt, parser, UI controls, and evals.
- Input, Output, and Evaluation field references.
- Input, Output, and Evaluation examples.
- PM Review case statuses, case sources, bad-case error types, common tags, and built-in case sets.

Provider base URLs, default models, model allowlists, and eval env-key names live in `apps/extension/src/shared/provider-config.json`.

The UI must not hardcode version values. Version chips, version filters, case metadata defaults, and contract manual display must read from the typed contract wrapper:

```ts
AI_CHECK_CONTRACT.current.promptVersion
AI_CHECK_CONTRACT.current.outputSchemaVersion
AI_CHECK_CONTRACT.current.evaluationSchemaVersion
AI_CHECK_CONTRACT.versionRegistry.prompts
AI_CHECK_CONTRACT.versionRegistry.outputSchemas
AI_CHECK_CONTRACT.versionRegistry.evaluationSchemas
AI_CHECK_CONTRACT.sessionPolicy.maxAssistantTurns
AI_CHECK_CONTRACT.sessionPolicy.maxSessionSeconds
```

The design docs may name these reference paths, but should avoid duplicating the current literal version values. Otherwise the docs become another drift source.

### Provider Message Manual

The runtime flow is not `Model Input -> System Prompt`. The System Prompt is one part of the provider request/model input.

The manual should make the provider request itself the primary reading model:

```ts
messages: [
  {
    role: "system",
    content: $ systemLevelPrompt
  },
  {
    role: "user",
    content: $ trustedRoundContext
  },
  ...conversationMessages,
  {
    role: "user",
    content: $ trustedTurnContext
  }
]
```

The first visible area in Schema Reference should include a compact version/reference strip only. The older multi-card flow diagram is too verbose for the reference surface and should not compete with the `messages[]` tree.

### Manual Tabs

Schema Reference should contain internal tabs:

- `Provider Messages`
- `Output`
- `Evaluation`
- `Compare`

The original top-level PM Review area remains unchanged. These are tabs inside Schema Reference.

The default tab should be `Provider Messages`.

The Provider Messages tab should use this layout:

```text
Provider message tree | Selected section preview
```

The left side shows the full `messages[]` array shape. Clicking `$ systemLevelPrompt`, `$ trustedRoundContext`, `...conversationMessages`, or `$ trustedTurnContext` changes the right-side preview. This keeps the reader oriented around what the provider actually receives without adding separate tabs for every message section.

The right side should be a lightweight preview panel, not a heavy inspector. It should show:

- a compact metadata row, such as `messages[0].content`, `role: system`, `Cross-Round Context`, and `Cross-Turn Context`.
- the selected XML-like prompt/context text as readable section blocks that preserve original line breaks.
- sample conversation message JSON in a code preview.
- light highlights for generated/dynamic sections.
- hover/focus tooltips for source paths when helpful.

It should not show the older detailed source inspector by default. Detailed meaning, resolved value, and product-impact explanation can return later behind a deliberate details disclosure if reviewers need it.

### Provider Messages Tab

The Provider Messages tab should display the current generated static System Prompt for a representative preview input, plus round context, sample conversation messages, and turn context inside one provider request tree. It should also display the prompt version from `AI_CHECK_CONTRACT.current.promptVersion` in the top version strip.

The preview must come from the runtime prompt builder, not from a PM Review-only duplicated prompt string.

The real provider-visible prompt and trusted context should use XML-like sections for readability and boundary clarity. The PM Review preview should render those sections as separate visual blocks so reviewers can distinguish real line breaks from viewport wrapping. Output schema and examples remain JSON because the model is required to return raw JSON.

The provider message contract refactor is tracked in [2026-05-21-ai-check-provider-message-contract-design.md](2026-05-21-ai-check-provider-message-contract-design.md). Schema Reference should not treat turn-level values as part of the System Prompt. It should explain the provider message sections as:

- System Prompt tags: `Cross-Round Context` and `Cross-Turn Context`.
- Round Context tag: `Round-Level Context`.
- Conversation tag: `Conversation`.
- Turn Context tag: `Turn-Level Context`.
- full Provider Messages array.

To support source-aware rendering, the prompt builder uses structured parts:

```ts
interface PromptPart {
  text: string;
  dynamic?: boolean;
  sourcePaths?: string[];
  value?: unknown;
  meaning?: string;
}

function buildSystemPromptParts(input: BuildSystemPromptInput): PromptPart[];

function buildSystemPrompt(input: BuildSystemPromptInput): string {
  return buildSystemPromptParts(input)
    .map((part) => part.text)
    .join("\n");
}
```

Runtime provider calls continue to use `buildSystemPrompt(input)`. PM Review uses `buildSystemPromptParts(input)` to render the same text with provenance highlights.

Dynamic prompt parts should be lightly highlighted in the prompt preview. Hovering or focusing a highlighted part can expose the source reference path.

Contract enum prompt blocks should render enum values as individual highlighted tokens rather than plain comma-separated text. This makes it clear that values such as `ALLOW`, `ASK_MORE`, `repeated_excuse`, and `boredom` come from the shared contract instead of free-form prose.

Expected highlighted dynamic sources include:

- `strictness` from the preview/runtime input.
- `assistantTurnCount` from the preview/runtime input.
- `AI_CHECK_CONTRACT.sessionPolicy.maxAssistantTurns`.
- `AI_COOLDOWN_POLICIES[strictness]`.
- `AI_CHECK_CONTRACT.enums.decisions`.
- `AI_CHECK_CONTRACT.enums.decisionReasonCategories`.
- `AI_CHECK_CONTRACT.enums.behaviorReasonCategories`.
- `AI_CHECK_CONTRACT.sections.output.example`.
- `AI_CHECK_CONTRACT.sections.output.schemaSummary`.

The full prompt should remain readable as text. Source path hints are explanatory, not a replacement for the prompt.

### Provider Message Sections

Round Context should focus `messages[1].content`. It explains target, strictness, policy, pattern memory, and version snapshots fixed for the active AI Check round.

Conversation should focus `...conversationMessages`. It explains that visible user/assistant messages are append-only and remain in their original roles.

Turn Context should focus the final user-role trusted block. It explains the current turn count and final-turn `ASK_MORE` guard. This section changes every provider call and stays at the end of the message array.

### Output and Evaluation Tabs

Output and Evaluation use a schema-left, example-right contract reference layout:

```text
Schema JSON viewer | Example JSON viewer
```

The left side should render the selected version's schema as a dark, code-oriented JSON viewer. It should match the visual density, spacing, and monospace treatment of the example viewer instead of using a card/tree inspector. Schema and example viewers should use lightweight JSON token highlighting for keys, strings, numbers, null/literals, punctuation, and schema type values.

The right side should render the selected version's complete contract example in the same dark, code-oriented style as Provider Messages. Clicking or focusing a selectable example line can keep the corresponding schema path highlighted when the schema line maps to a known field.

### Output Tab

The Output tab should render the output schema JSON on the left and `AI_CHECK_CONTRACT.sections.output.example` on the right.

It should also show the prompt-facing output schema from `AI_CHECK_CONTRACT.sections.output.promptSchema` and the concise schema summary from `AI_CHECK_CONTRACT.sections.output.schemaSummary`.

This tab explains the model response contract and how parser validation turns that response into product behavior.

### Evaluation Tab

The Evaluation tab should render the evaluation schema JSON on the left and `AI_CHECK_CONTRACT.sections.evaluation.example` on the right.

It should explicitly explain:

```text
Evaluation Case = input + optional captured output + eval expectations
Regression Case = Evaluation Case where status = regression and archivedAt is empty
```

The page should distinguish:

- `input`: what the model saw.
- `output.parsed`: optional captured provider behavior for inspection.
- `eval`: PM-authored assertions and tags.

### Compare Tab

Compare should make the difference between Input, Output, and Evaluation obvious.

The first version should use path-level comparison rather than a complex semantic diff:

```text
Path                         Input   Output   Evaluation
targetDisplay                yes     no       inside input
decision                     no      yes      expectedOutput.decision
scores.impulse               no      yes      expectedOutput.scores.impulse
memoryUpdate.behaviorReasonCategory no yes    expectedOutput.memoryUpdate.behaviorReasonCategory
```

The comparison should be derived from the contract section field paths, not from a manually maintained table.

Lightweight visual highlights can help orientation:

- newly visible paths get a short add highlight.
- removed paths get a muted state in Compare, not in the normal schema tabs.
- paths with related but not identical meanings can get a changed marker.

The Compare table is the primary explanation. Animation should only reinforce the difference, not carry the meaning.

### Drift Prevention

This manual must stay synchronized with runtime schema, parser validation, prompt contract, eval runner, and design docs.

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

When any Input, Output, Evaluation, enum, policy, or version field changes, update `ai-check-contract.json` first, then update parser constraints, TypeScript types, eval assertions, tests, and linked docs in the same change.

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

Phase 3b: AI Check Contract Manual

- Add Schema Reference internal tabs for Provider Messages, Output, Evaluation, and Compare.
- Render version chips from `AI_CHECK_CONTRACT` reference fields rather than hardcoded labels.
- Render Output and Evaluation examples from their contract sections.
- Add a Provider Messages viewer backed by structured prompt/context parts from the runtime builders.
- Add path-level Compare generated from contract section field paths.

Phase 4: regression workflow

- Surface regression filter and regression case set.
- Show latest eval result per case once eval run history is available.
- Use regression cases as release-gating defaults.
