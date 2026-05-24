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

PM Review now has a local AI quality workspace shape with History Cases, Evaluation Cases, Experiment Lab, and Schema Reference areas. Evaluation Cases can be created, edited, assigned to `datasetType = regression`, filtered through built-in case sets/tags/search, archived instead of hard-deleted, and evaluated through local mock-mode experiment runs.

Schema Reference now acts as an AI Check Contract Manual centered on the provider `messages[]` request, plus Output and Evaluation views from shared contract references.

## Already Exists

- Current PM Review page at `review.html`.
- History Case list from local AI Check sessions.
- Session detail with transcript, selectable decision points, model output JSON, and stored decision record.
- Bad-case marking with expected decision, error types, and reviewer note.
- Conversion from bad case to unified Evaluation Case.
- Unified `AICheckCase { input, output?, eval? }` schema.
- Built-in eval fixtures in the unified schema, visible in Case Library.
- Local `eval:ai-check` runner with tag reporting and dataset filtering.
- `AICheckCase.status` lifecycle field: `draft`, `ready`, `archived`.
- `AICheckCase.datasetType` experiment-purpose field: `design`, `regression`, `holdout`.
- Archive metadata: `archivedAt`, `archivedReason`.
- Background review messages for create, update, list, and archive Evaluation Cases.
- Top-level PM Review areas: History Cases, Evaluation Cases, Schema Reference.
- Evaluation Case three-column UI with built-in case sets, tag/search filters, case list, and detail editor.
- Add/edit form with concrete placeholders and enum selects.
- Schema Reference descriptor rendered in PM Review as an expandable JSON-shaped tree with a complete example output.
- AI Check contract source at `apps/extension/src/shared/ai-check-contract.json`.
- Prompt builder, parser enum values, eval runner provider schema, schema examples, version constants, and PM Review field reference derive from the shared contract.
- PM Review statuses, dataset/provenance options, bad-case error types, common tags, built-in case sets, and AI Check session policy derive from the shared contract.
- Runtime and eval provider metadata derive from `apps/extension/src/shared/provider-config.json`.
- Provider-mode evals reuse the runtime AI Check message builder.
- `AGENTS.md` rules for schema synchronization, unified Evaluation Case shape, archive behavior, dataset semantics, and Regression Case semantics.
- Eval runner default exclusion of archived cases and status/tag/dataset filters such as `--dataset=regression`.

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

- Done: add internal Contract Manual tabs for Provider Messages, Output, and Evaluation.
- Done: render version controls from `AI_CHECK_CONTRACT.current`, `AI_CHECK_CONTRACT.versionRegistry`, and `AI_CHECK_CONTRACT.sessionPolicy`.
- Done: render Output and Evaluation examples from `AI_CHECK_CONTRACT.sections`.
- Done: add a Provider Messages viewer that displays the provider request tree and highlights generated parts with source references.
- Done: render the actual XML-like provider-visible prompt/context sections in the Provider Messages preview while keeping output schema/example JSON.
- Done: keep runtime prompt text and PM Review prompt preview aligned through structured prompt parts.
- Done: align Contract Manual with the provider message contract refactor so System Prompt, Round Context, Conversation, and Turn Context are shown inside the Provider Messages tree.
- Done: simplify Contract Manual readability by making the provider `messages[]` tree the default view, removing the extra provider-section tabs, removing the multi-card flow diagram, and replacing the heavy source inspector with a lightweight preview panel.
- Done: render selected prompt/context content as XML-like section blocks in the right preview, preserving original line breaks while reducing ambiguity from viewport wrapping.
- Done: unify Provider Messages preview tags to `Cross-Round Context`, `Cross-Turn Context`, `Round-Level Context`, `Conversation`, and `Turn-Level Context`.
- Done: render provider-preview contract enum blocks as highlighted tokens instead of plain comma-separated text.
- Done: update Output and Evaluation tabs to show schema JSON on the left and complete example JSON on the right.
- Done: add lightweight JSON syntax highlighting for schema and example code viewers.
- Done: back Contract Manual version controls with `AI_CHECK_CONTRACT.current` and `AI_CHECK_CONTRACT.versionRegistry`.

### Phase 4: Regression Workflow

- Done: treat Regression Cases as Evaluation Cases with `status = ready`, `datasetType = regression`, and no `archivedAt`.
- Done: add default Regression Dataset filter/case set.
- Done: exclude archived cases from default eval runs.
- Done: add eval runner status/tag/dataset filters for regression-style runs.
- Done: surface local mock-mode Experiment Lab run history, metrics, failures, and release gate summary.
- Later: decide whether CI/release gating should default to `--dataset=regression` or keep general active-case runs as the default command.

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
- Ran `npm --workspace apps/extension run typecheck` after simplifying the Contract Manual provider-message view.
- Ran PM Review browser smoke check after the Prompt Engineering Console first slice: Evaluation Cases showed 42 built-in cases, Experiment Lab ran 42/42, and release gate showed PASS.

Pending validation:

- Browser visual polish pass on the Experiment Lab layout after provider-mode runs are introduced.

## Synchronization Note

2026-05-20:

- Created PM Review Workspace design/progress/issues docs.
- Design doc references the current unified AI Check case schema and AI review/eval loop docs.
- Issues doc opened blockers for status/archive semantics, case set behavior, schema reference drift, Evaluation Case editing validation, and Regression Case gating.
- Implemented first PM Review workspace slice in code.
- Reworked Schema Reference from a flat field-card grid into a collapsible JSON tree plus example output.
- Refactored AI Check schema facts into contract-first source `ai-check-contract.json`.
- Moved PM Review and session-policy facts into `ai-check-contract.json`, moved provider facts into `provider-config.json`, and updated provider evals to use the runtime prompt path.
- Updated the next Schema Reference design to an AI Check Contract Manual covering Provider Messages, Output, Evaluation, and version references.
- Implemented the AI Check Contract Manual tabs, version reference strip, and provider message preview.
- Added a follow-up provider message contract design because the next architecture step separates static System Prompt, round-stable context, append-only conversation, and turn-level context for clearer caching behavior.
- Implemented the provider message contract split and updated PM Review Contract Manual tabs to match the new message sections.
- Simplified the Contract Manual presentation so Provider Messages is the default model and System/Round/Conversation/Turn are clicked inside the same `messages[]` tree instead of separate tabs.
- Updated `AGENTS.md` with PM Review schema-sync, archive, and regression rules.
- Updated this progress doc and the issues doc because scope/status changed from design-only to implementation checkpoint.

2026-05-21:

- PM Review Contract Manual now reflects `checkpoint-decision-v3` / `ai-check-prompt-v4` from the shared AI Check contract.
- Output reference no longer shows a separate `nextQuestion`; `ASK_MORE` uses `userFacingMessage` as the follow-up question.
- Design and issues docs were checked; no PM Review layout or blocker update was needed because the UI renders the contract data dynamically.

2026-05-24:

- PM Review now includes Experiment Lab as the first prompt-engineering experiment slice.
- Case Library now shows built-in regression fixtures by default, so the local page no longer appears empty when IndexedDB has no authored cases.
- Regression semantics were updated from `status = regression` to `status = ready` plus `datasetType = regression`.
- This progress doc was updated because PM Review workspace status changed. The newer Prompt Engineering Console docs now own the forward-looking product model.

## Update Checklist

When this progress doc changes, check:

- Design doc: did the intended PM Review workflow or layout change?
- Issues doc: should a blocker be opened, closed, or reprioritized?
- AI Check case schema docs: did the case shape or schema reference contract change?
- AI review/eval loop docs: does the loop description need a link to this newer workspace design?
