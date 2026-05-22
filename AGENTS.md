# BetterMe Agent Instructions

## Project Docs

- `docs/` is the canonical location for project documentation.
- Do not create a separate `doc/` working-docs path.
- Design documents live under `docs/design/`.
- Every file under `docs/design/` must include the date in `YYYY-MM-DD` format at the start of the filename.
- Use clear suffixes:
  - `YYYY-MM-DD-<topic>-design.md`
  - `YYYY-MM-DD-<topic>-progress.md`
  - `YYYY-MM-DD-<topic>-issues.md`
- For a design topic, maintain three linked documents:
  - `design`: product intent, high-level architecture, state model, behavioral rules, implementation strategy.
  - `progress`: what is done, what is in progress, what remains, validation status.
  - `issues`: known bugs, open questions, risks, repro notes, decision blockers.
- The three documents must reference each other near the top.
- When updating any one of the three documents, check the other two and update them if the change affects scope, status, risk, or implementation order.
- If only one document changes after the check, note why the other two did not need updates.

## BetterMe Product Direction

- Treat BetterMe as a privacy-first Chrome MV3 extension.
- Keep long-term blocked targets separate from temporary access state.
- Do not treat license unlock, AI readiness, temporary unlock, cooldown, and block hold as the same concept.
- Prefer explicit state derivation over scattered UI conditionals.

## AI Check PM Review

- Evaluation cases must use the unified `AICheckCase { input, output?, eval? }` shape.
- Do not hard-delete Evaluation Cases from PM Review; archive them with `status = "archived"` and `archivedAt`.
- Regression Cases are Evaluation Cases with `status = "regression"` and no `archivedAt`.
- AI Check input, output, evaluation schema fields, enum values, examples, and PM Review schema reference should come from `apps/extension/src/shared/ai-check-contract.json`.
- AI Check session policy, including `maxAssistantTurns` and `maxSessionSeconds`, should come from `apps/extension/src/shared/ai-check-contract.json`.
- Provider metadata, including base URLs, default models, model allowlists, and eval env-key names, should come from `apps/extension/src/shared/provider-config.json`.
- Do not manually duplicate AI Check output schema strings in `prompt.ts`, `eval-ai-check.mjs`, or PM Review UI.
- Provider-mode evals must reuse the runtime AI Check prompt/message builder instead of maintaining a separate eval-only prompt.
- Provider messages should keep the cache-friendly order: static System Prompt, trusted Round Context, append-only Conversation, then trusted Turn Context.
- Round Context values, including strictness and policy snapshots, should stay fixed for the active AI Check round; Settings changes apply to the next round.
- Evaluation cases should carry the current `promptVersion`, `outputSchemaVersion`, and `evaluationSchemaVersion`; default eval runs should only use current-version active cases unless a legacy run is explicitly requested.
- AI Check contract version bumps must preserve old entries in `versionRegistry`; add the new version as current instead of overwriting historical prompt, output schema, or evaluation schema references.
- Evaluation expectations should live under `eval.expectedOutput` as an output-shaped mirror; do not add new root-level eval assertion fields unless they cannot be tied to a model output field.
- When changing AI Check Input, Output, or Evaluation schema, update `ai-check-contract.json` first, then update parser constraints, TypeScript types, eval assertions, tests, and linked design/progress/issues docs in the same change.
- When changing Prompt Version, Output Schema Version, or Evaluation Schema Version, update `current`, `versionRegistry`, eval fixtures or archive status, and linked design/progress/issues docs in the same change.
