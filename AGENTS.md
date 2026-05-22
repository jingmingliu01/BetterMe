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

## AI Check Contract and PM Review

- `apps/extension/src/shared/ai-check-contract.json` is the AI Check single source of truth.
- AI Check input schema, model output schema, evaluation schema, enum values, examples, version registry, session policy, prompt-facing schema, schema summaries, and PM Review schema reference must originate from `ai-check-contract.json`.
- Do not hand-author `sections` in `ai-check-contract.json`; PM Review sections are generated from `schemas`, `examples`, and `pmReview.fieldDocs`.
- `types.ts` is not the AI Check contract source. AI Check TypeScript types should be generated from the contract or re-export generated contract types once generation exists.
- Do not introduce new hand-maintained AI Check schema copies in `types.ts`, `prompt.ts`, `checkpoint-schema.ts`, `eval-ai-check.mjs`, PM Review UI, fixtures, or docs.
- Until generation is fully implemented, any derived AI Check surface changed by hand must have a drift test or validator assertion proving it still matches `ai-check-contract.json`.
- After AI Check contract changes, run `npm run check:ai-check-contract` to verify generated output and contract validation.
- Provider metadata, including base URLs, default models, model allowlists, and eval env-key names, should come from `apps/extension/src/shared/provider-config.json`.
- Evaluation cases must use the unified `AICheckCase { input, output?, eval? }` shape.
- Evaluation expectations should live under `eval.expectedOutput` as an output-shaped mirror; do not add root-level eval assertion fields unless they cannot be tied to a model output field.
- Do not hard-delete Evaluation Cases from PM Review; archive them with `status = "archived"` and `archivedAt`.
- Regression Cases are Evaluation Cases with `status = "regression"` and no `archivedAt`.
- Provider-mode evals must reuse the runtime AI Check prompt/message builder instead of maintaining a separate eval-only prompt.
- Provider messages should keep the cache-friendly order: static System Prompt, trusted Round Context, append-only Conversation, then trusted Turn Context.
- Round Context values, including strictness and policy snapshots, should stay fixed for the active AI Check round; Settings changes apply to the next round.
- Evaluation cases should carry the current `promptVersion`, `outputSchemaVersion`, and `evaluationSchemaVersion`; default eval runs should only use current-version active cases unless a legacy run is explicitly requested.
- AI Check contract version bumps must preserve old entries in `versionRegistry`; add the new version as current instead of overwriting historical prompt, output schema, or evaluation schema references.
- When changing AI Check Input, Output, or Evaluation schema, update `ai-check-contract.json` first, then regenerate or validate generated TypeScript types, parser constraints, eval assertions, PM Review references, fixtures, tests, and linked design/progress/issues docs in the same change.
- When changing Prompt Version, Output Schema Version, or Evaluation Schema Version, update `current`, `versionRegistry`, eval fixtures or archive status, and linked design/progress/issues docs in the same change.
