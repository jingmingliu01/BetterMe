# 2026-05-20 PM Review Workspace Issues

Related docs:

- Design: [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md)
- Progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- AI Check case schema issues: [2026-05-20-ai-check-case-schema-issues.md](2026-05-20-ai-check-case-schema-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: PM Review has no Evaluation Case workspace

Status: closed in first implementation slice

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

- Evaluation Cases have `draft`, `ready`, `regression`, and `archived` statuses.
- Regression Cases are Evaluation Cases where `status = regression` and `archivedAt` is empty.
- Default regression filters exclude archived cases.

Resolution:

- `AICheckCase.status` is part of the shared type.
- Bad Case conversion creates `draft` cases.
- PM Review exposes status controls and a Regression Suite filter.

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
- Built-in case sets cover All Active Cases, Regression Suite, Draft Review Queue, Sensitive Risk, and Strictness Suite.
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
- `AGENTS.md` records the schema-sync rule.

Resolution:

- PM Review renders field reference data derived from `apps/extension/src/shared/ai-check-contract.json`.
- The descriptor covers the required schema fields, validation, product impact, and common mistakes.
- The UI renders the descriptor as an expandable JSON-shaped tree with a complete example output instead of a flat card list.
- Prompt builder, parser enum values, eval runner provider schema text, version constants, examples, and PM Review reference now derive from the shared contract.
- PM Review statuses, source options, bad-case error types, common tags, built-in case sets, and AI Check session policy now derive from the shared contract.
- Provider metadata derives from `apps/extension/src/shared/provider-config.json`.
- `AGENTS.md` now requires schema changes to start from `ai-check-contract.json`, then update parser constraints, TypeScript types, eval assertions, tests, and linked docs in the same change.

### ISSUE-006: Add/edit form needs guardrails

Status: partially closed

Risk:

- Free-form fields for enum-like values can create invalid Evaluation Cases.
- Reviewers may not know what a good input or assertion looks like.

Expected behavior:

- Enum fields use selects, segmented controls, toggles, or multi-selects.
- Free-text fields use concrete placeholders.
- Required fields validate before a case can move from `draft` to `ready` or `regression`.

Resolution:

- Source, status, strictness, and expected decision use select controls.
- Core free-text fields use concrete placeholders.
- Save is disabled when title, target, or user message is empty.

Remaining:

- The UI does not yet enforce stricter validation before moving from `draft` to `ready` or `regression`.
- Tags are still comma-separated text rather than a true multi-select.

### ISSUE-007: Eval runner defaults do not yet understand status/archive

Status: partially closed

Risk:

- Archived or draft cases could run in release-gating evals.
- Regression status may exist in UI but not affect command behavior.

Expected behavior:

- Default regression run includes only `status = regression` and no `archivedAt`.
- General eval runs can explicitly include draft or archived cases when requested.
- Runner output can still report pass rate by tag and by case set.

Resolution:

- Eval runner normalizes missing status to `ready`.
- Eval runner excludes archived cases by default.
- Eval runner supports status and tag filters such as `--status=regression` and `--tag=unsafe_sensitive_advice`.
- Eval runner rejects prompt/schema/rubric version mismatches by default and allows explicit legacy runs with `--include-legacy`.

Remaining:

- The default `eval:ai-check` command still runs active cases, not only regression cases.
- Runner output reports by tag but not by case set.
