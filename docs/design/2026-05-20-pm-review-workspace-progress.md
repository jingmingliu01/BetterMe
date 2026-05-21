# 2026-05-20 PM Review Workspace Progress

Related docs:

- Design: [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md)
- Issues: [2026-05-20-pm-review-workspace-issues.md](2026-05-20-pm-review-workspace-issues.md)
- AI review/eval loop progress: [2026-05-18-ai-review-eval-loop-progress.md](2026-05-18-ai-review-eval-loop-progress.md)
- AI Check case schema progress: [2026-05-20-ai-check-case-schema-progress.md](2026-05-20-ai-check-case-schema-progress.md)
- AI Check provider message contract progress: [2026-05-21-ai-check-provider-message-contract-progress.md](2026-05-21-ai-check-provider-message-contract-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

First implementation slice is in progress and locally implemented.

PM Review now has a local AI quality workspace shape with History Cases, Evaluation Cases, and Schema Reference areas. Evaluation Cases can be created, edited, promoted to `regression`, filtered through built-in case sets/tags/search, and archived instead of hard-deleted.

Schema Reference now acts as an AI Check Contract Manual that explains Input, System Prompt, Output, Evaluation, and their differences from shared contract references.

## Already Exists

- Current PM Review page at `review.html`.
- History Case list from local AI Check sessions.
- Session detail with transcript and latest decision JSON.
- Bad-case marking with expected decision, error types, and reviewer note.
- Conversion from bad case to unified Evaluation Case.
- Unified `AICheckCase { input, output?, eval? }` schema.
- Built-in eval fixtures in the unified schema.
- Local `eval:ai-check` runner with tag reporting.
- `AICheckCase.status` lifecycle field: `draft`, `ready`, `regression`, `archived`.
- Archive metadata: `archivedAt`, `archivedReason`.
- Background review messages for create, update, list, and archive Evaluation Cases.
- Top-level PM Review areas: History Cases, Evaluation Cases, Schema Reference.
- Evaluation Case three-column UI with built-in case sets, tag/search filters, case list, and detail editor.
- Add/edit form with concrete placeholders and enum selects.
- Schema Reference descriptor rendered in PM Review as an expandable JSON-shaped tree with a complete example output.
- AI Check contract source at `apps/extension/src/shared/ai-check-contract.json`.
- Prompt builder, parser enum values, eval runner provider schema, schema examples, version constants, and PM Review field reference derive from the shared contract.
- PM Review statuses, source options, bad-case error types, common tags, built-in case sets, and AI Check session policy derive from the shared contract.
- Runtime and eval provider metadata derive from `apps/extension/src/shared/provider-config.json`.
- Provider-mode evals reuse the runtime AI Check message builder.
- `AGENTS.md` rules for schema synchronization, unified Evaluation Case shape, archive behavior, and Regression Case semantics.
- Eval runner default exclusion of archived cases and status/tag filters such as `--status=regression`.

## Planned Scope

### Phase 1: Data Model

- Done: add Evaluation Case status: `draft`, `ready`, `regression`, `archived`.
- Done: add archive metadata: `archivedAt`, `archivedReason`.
- Done: keep Evaluation Cases on the unified `AICheckCase` shape only.
- Partial: built-in case sets are implemented as code-defined filters; persisted custom case sets remain future scope.

### Phase 2: Evaluation Workspace

- Done: add top-level PM Review areas: History Cases, Evaluation Cases, Schema Reference.
- Done: add Evaluation Cases three-column layout:
  - filters and case sets.
  - case list.
  - selected case detail/editor.
- Done: add create flow with placeholders and select controls.
- Done: add edit flow for core case input/eval fields.
- Done: add archive flow instead of hard delete.
- Partial: filters cover built-in status/risk case sets, tags, and search. Dedicated strictness, expected decision, version, and source controls remain later polish.

### Phase 3: Schema Reference

- Done: add structured schema reference descriptor in `apps/extension/src/shared/ai-check-contract.json`.
- Done: render Schema Reference in PM Review as an expandable JSON-shaped tree.
- Done: explain each field's meaning, necessity, product impact, validation, and common mistakes.
- Done: add a complete `ASK_MORE` example output.
- Done: derive prompt output schema text, parser enum values, eval runner schema text, version constants, and PM Review reference from the shared contract.
- Done: add AI logic assertions that the prompt and parser use the shared contract output example/schema.
- Done: update `AGENTS.md` with the schema-sync and archive rules.
- Ongoing: keep schema reference synchronized with prompt, parser, eval runner, and docs whenever schema fields change.

### Phase 3b: AI Check Contract Manual

- Done: add internal Contract Manual tabs for System Prompt, Round Context, Conversation, Turn Context, Provider Messages, Output, Evaluation, and Compare.
- Done: render version chips from `AI_CHECK_CONTRACT.promptVersion`, `AI_CHECK_CONTRACT.schemaVersion`, `AI_CHECK_CONTRACT.rubricVersion`, and `AI_CHECK_CONTRACT.sessionPolicy`.
- Done: render Input, Output, and Evaluation JSON trees from `AI_CHECK_CONTRACT.sections`.
- Done: add a source-aware System Prompt viewer that displays the current generated prompt and highlights dynamic parts with source references.
- Done: add path-level Compare generated from contract section field paths.
- Done: keep runtime prompt text and PM Review prompt preview aligned through structured prompt parts.
- Done: align Contract Manual with the provider message contract refactor so System Prompt, Round Context, Conversation, Turn Context, and Provider Messages are shown as separate sections.

### Phase 4: Regression Workflow

- Done: treat Regression Cases as Evaluation Cases with `status = regression` and no `archivedAt`.
- Done: add default Regression Suite filter/case set.
- Done: exclude archived cases from default eval runs.
- Done: add eval runner status/tag filters for regression-style runs.
- Later: surface latest eval run result per case.
- Later: decide whether CI/release gating should default to `--status=regression` or keep general active-case runs as the default command.

## Validation Status

Implementation checkpoint.

Validation performed:

- Checked existing PM Review and AI case schema docs for naming and scope alignment.
- Created linked design/progress/issues document set.
- Ran `npm --workspace apps/extension run typecheck`.
- Run `npm --workspace apps/extension run test:ai-check`.
- Run `npm --workspace apps/extension run eval:ai-check`.
- Run `npm --workspace apps/extension run test:e2e`.
- Run `git diff --check`.
- Opened the packaged extension Review page with Playwright and captured `/tmp/betterme-schema-reference.png` to verify the Schema Reference tree/example renders.

Pending validation:

- Browser visual polish pass on the Evaluation Case three-column layout with a populated local dataset.

## Synchronization Note

2026-05-20:

- Created PM Review Workspace design/progress/issues docs.
- Design doc references the current unified AI Check case schema and AI review/eval loop docs.
- Issues doc opened blockers for status/archive semantics, case set behavior, schema reference drift, Evaluation Case editing validation, and Regression Case gating.
- Implemented first PM Review workspace slice in code.
- Reworked Schema Reference from a flat field-card grid into a collapsible JSON tree plus example output.
- Refactored AI Check schema facts into contract-first source `ai-check-contract.json`.
- Moved PM Review and session-policy facts into `ai-check-contract.json`, moved provider facts into `provider-config.json`, and updated provider evals to use the runtime prompt path.
- Updated the next Schema Reference design to an AI Check Contract Manual covering Input, System Prompt provenance, Output, Evaluation, version references, and contract-section comparison.
- Implemented the AI Check Contract Manual tabs, version reference strip, System Prompt source inspector, and contract path comparison table.
- Added a follow-up provider message contract design because the next architecture step separates static System Prompt, round-stable context, append-only conversation, and turn-level context for clearer caching behavior.
- Implemented the provider message contract split and updated PM Review Contract Manual tabs to match the new message sections.
- Updated `AGENTS.md` with PM Review schema-sync, archive, and regression rules.
- Updated this progress doc and the issues doc because scope/status changed from design-only to implementation checkpoint.

## Update Checklist

When this progress doc changes, check:

- Design doc: did the intended PM Review workflow or layout change?
- Issues doc: should a blocker be opened, closed, or reprioritized?
- AI Check case schema docs: did the case shape or schema reference contract change?
- AI review/eval loop docs: does the loop description need a link to this newer workspace design?
