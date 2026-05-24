# 2026-05-20 PM Review Workspace Issues

Related docs:

- Design: [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md)
- Progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- AI Check case schema issues: [2026-05-20-ai-check-case-schema-issues.md](2026-05-20-ai-check-case-schema-issues.md)
- AI Check provider message contract issues: [2026-05-21-ai-check-provider-message-contract-issues.md](2026-05-21-ai-check-provider-message-contract-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: PM Review has no Evaluation Case workspace

Status: closed; updated by Prompt Engineering Console slice

Risk:

- PM can convert History Cases into Evaluation Cases but cannot inspect, edit, filter, archive, or promote them to regression from the UI.
- The review workflow stops after conversion and does not support ongoing eval-suite maintenance.

Expected behavior:

- PM Review has a top-level Evaluation Cases area.
- Evaluation Cases render in a three-column layout: filters/case sets, list, selected detail.
- PM can add, edit, archive, and filter Evaluation Cases.

Resolution:

- PM Review now has an Evaluation Cases area with built-in case sets/tag/search filters, a case list, and a selected detail editor.
- Add, edit, status promotion, and archive actions are available through background review messages.

### ISSUE-002: Evaluation Case lifecycle is not explicit

Status: closed in first implementation slice

Risk:

- A draft converted from a bad case can be mistaken for a release-gating regression case.
- There is no clear promotion path from authored/evaluated case to regression case.

Expected behavior:

- Evaluation Cases have `draft`, `ready`, and `archived` lifecycle statuses.
- Regression Cases are Evaluation Cases where `datasetType = regression`, `status = ready`, and `archivedAt` is empty.
- Default regression filters exclude archived cases.

Resolution:

- `AICheckCase.status` is part of the shared type.
- Bad Case conversion creates `draft` cases.
- PM Review exposes status controls, dataset controls, and a Regression Dataset filter.
- Prompt Engineering Console v3 split lifecycle status from dataset purpose.

### ISSUE-003: Delete semantics could destroy useful review history

Status: closed in first implementation slice

Risk:

- Hard deleting Evaluation Cases can break eval run history and remove the reasoning behind a past regression decision.
- PM may need to hide stale cases without losing traceability.

Expected behavior:

- PM Review archives Evaluation Cases instead of hard deleting them.
- Archived cases capture `archivedAt` and optional `archivedReason`.
- Archived cases are hidden by default and recoverable through filters.

Resolution:

- PM Review provides archive, not hard delete.
- Archived cases receive `status = archived`, `archivedAt`, and `archivedReason`.
- Archived cases are hidden from active case sets and visible through the Archive case set.

### ISSUE-004: Case sets need a low-complexity first model

Status: partially closed

Risk:

- Building case sets as duplicated case collections can create drift between the same case in multiple sets.
- A complex case-set editor may slow down the first usable Evaluation workspace.

Expected behavior:

- Case sets start as saved filters.
- Built-in case sets cover All Active Cases, Regression Dataset, Draft Review Queue, Sensitive Risk, and Strictness Suite.
- A case can appear in multiple case sets without duplication.

Resolution:

- Built-in case sets are implemented as code-defined filters and do not duplicate cases.

Remaining:

- Persisted user-defined case sets and a case-set editor are not implemented yet.

### ISSUE-005: Schema Reference can drift from runtime schema

Status: closed for first implementation slice; ongoing maintenance rule

Risk:

- PM reviewers may rely on stale field explanations.
- Prompt/parser/eval changes can silently diverge from the UI reference.
- Reviewers may mislabel cases if field impact is unclear.

Expected behavior:

- Schema Reference is generated from the shared AI Check contract.
- The descriptor covers meaning, necessity, product impact, validation, and common mistakes.
- Schema Reference updates are required whenever the structured output schema changes.
- Prompt, output schema, and evaluation schema version displays are rendered from contract current/version registry fields, not duplicated literals.
- `AGENTS.md` records the schema-sync rule.

Resolution:

- PM Review renders field reference data derived from `apps/extension/src/shared/ai-check-contract.json`.
- The descriptor covers the required schema fields, validation, product impact, and common mistakes.
- The UI renders the descriptor as an expandable JSON-shaped tree with a complete example output instead of a flat card list.
- Prompt builder, parser enum values, eval runner provider schema text, version constants, examples, and PM Review reference now derive from the shared contract.
- PM Review Contract Manual version controls now read from `AI_CHECK_CONTRACT.current` and `AI_CHECK_CONTRACT.versionRegistry`.
- PM Review statuses, dataset/provenance options, bad-case error types, common tags, built-in case sets, and AI Check session policy now derive from the shared contract.
- Provider metadata derives from `apps/extension/src/shared/provider-config.json`.
- `AGENTS.md` now requires schema changes to start from `ai-check-contract.json`, then update parser constraints, TypeScript types, eval assertions, tests, and linked docs in the same change.

### ISSUE-008: Schema Reference does not yet explain the full AI Check request contract

Status: closed in AI Check Contract Manual slice

Risk:

- Reviewers can see the model output shape but not how the provider request is assembled.
- The page can imply that the System Prompt is formed after model input, when it is actually part of the provider request.
- Reviewers need Output and Evaluation references close to the provider request explanation.

Expected behavior:

- Schema Reference behaves as an AI Check Contract Manual.
- The manual shows the correct runtime flow: contract and runtime context feed the System Prompt builder, then the provider request includes System Prompt, current target, pattern memory, and user-visible messages.
- The manual has internal tabs for Provider Messages, Output, and Evaluation.
- Provider Messages renders the `messages[]` tree; Output and Evaluation tabs render schema JSON on the left and the complete example on the right.

Resolution:

- Schema Reference now has internal tabs for Provider Messages, Output, and Evaluation.
- Provider Messages renders the same `messages[]` tree with a focused preview panel for the selected section.
- The preview panel renders generated prompt/context content as section blocks, preserving original line breaks and keeping visual wrapping from looking like missing structure.
- Output and Evaluation tabs render contract schema JSON on the left and complete examples in the same dark code style as Provider Messages on the right.
- The top of the manual shows version references. The old multi-card runtime flow was removed because the provider message tree now carries the main orientation job.

### ISSUE-009: System Prompt preview needs source-aware dynamic fragments

Status: closed in AI Check Contract Manual slice

Risk:

- A plain prompt preview shows the current prompt but not why dynamic values appeared.
- If PM Review reconstructs prompt text separately, prompt reference can drift from runtime provider behavior.
- Reviewers cannot see whether a prompt fragment came from runtime input, session policy, enum values, output schema, example output, or strictness cooldown policy.

Expected behavior:

- Runtime prompt generation exposes structured prompt parts.
- `buildSystemPrompt(input)` remains the provider-facing function and joins structured parts into text.
- PM Review renders those same structured prompt parts with highlights for dynamic fragments.
- Hovering or focusing a highlighted fragment exposes source paths without requiring a heavy side inspector.
- Dynamic sources include preview/runtime `strictness`, assistant turn state, `AI_CHECK_CONTRACT.sessionPolicy`, `AI_COOLDOWN_POLICIES[strictness]`, contract enum values, output example, and output schema summary.

Resolution:

- Runtime prompt generation exposes structured prompt parts.
- `buildSystemPrompt(input)` joins the same structured parts used by PM Review.
- PM Review renders dynamic prompt parts with highlights.
- PM Review now uses a lighter preview panel. Dynamic fragments stay highlighted and expose source paths through lightweight hints; detailed source/value/product-impact explanation is not shown by default.

Follow-up:

- [2026-05-21-ai-check-provider-message-contract-design.md](2026-05-21-ai-check-provider-message-contract-design.md) split the provider message contract so turn-level context is no longer treated as part of the static System Prompt.

### ISSUE-006: Add/edit form needs guardrails

Status: partially closed

Risk:

- Free-form fields for enum-like values can create invalid Evaluation Cases.
- Reviewers may not know what a good input or assertion looks like.

Expected behavior:

- Enum fields use selects, segmented controls, toggles, or multi-selects.
- Free-text fields use concrete placeholders.
- Required fields validate before a case can move from `draft` to `ready`.

Resolution:

- Dataset, status, strictness, and expected decision use select controls.
- Core free-text fields use concrete placeholders.
- Save is disabled when title, target, or user message is empty.

Remaining:

- The UI does not yet enforce stricter validation before moving from `draft` to `ready`.
- Tags are still comma-separated text rather than a true multi-select.

### ISSUE-007: Eval runner defaults do not yet fully productize dataset/release gates

Status: mostly closed; release-gate workflow still open

Risk:

- Archived or draft cases could run in release-gating evals.
- Regression dataset membership exists in UI and CLI filters, but CI/release defaults are still a product decision.

Expected behavior:

- Default regression run includes only `datasetType = regression`, `status = ready`, and no `archivedAt`.
- General eval runs can explicitly include draft or archived cases when requested.
- Runner output can still report pass rate by tag and by case set.

Resolution:

- Eval runner normalizes missing status to `ready`.
- Eval runner excludes archived cases by default.
- Eval runner supports status, dataset, and tag filters such as `--dataset=regression` and `--tag=unsafe_sensitive_advice`.
- Eval runner rejects prompt/output-schema/evaluation-schema version mismatches by default and allows explicit legacy runs with `--include-legacy`.
- PM Review Experiment Lab stores local mock-mode run history and shows release gate summary.
- PM Review Experiment Lab protects Holdout details in tuning mode and reveals Holdout failure summaries only in release review mode.
- PM Review Experiment Lab supports provider-mode UI runs through saved local BYOK keys.
- PM Review Experiment Lab stores Release Decisions for selected runs.

Remaining:

- The default `eval:ai-check` command still runs active cases, not only regression cases.
- CLI runner output reports by tag but not by case set or release gate summary.
