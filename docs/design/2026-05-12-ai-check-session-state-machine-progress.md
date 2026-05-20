# 2026-05-12 AI Check Session State Machine Progress

Related docs:

- Design: [2026-05-12-ai-check-session-state-machine-design.md](2026-05-12-ai-check-session-state-machine-design.md)
- Issues: [2026-05-12-ai-check-session-state-machine-issues.md](2026-05-12-ai-check-session-state-machine-issues.md)
- Access state progress: [2026-05-12-access-state-progress.md](2026-05-12-access-state-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

The AI Check session state-machine foundation is implemented.

The current product now has derived AI readiness, send-first UX, typed provider errors, AI-specific message timeout, stricter decision validation, AI cooldown continuation, hold replay, PM review conversion, and local eval coverage.

Current product direction: there is no paywall or license unlock surface. AI Check availability depends on local provider configuration and access state.

## Already Exists

- `AICheckSession`, `AICheckMessage`, `CheckpointDecision` model types.
- Local encrypted provider key storage.
- Provider registry for OpenAI, DeepSeek, and Kimi.
- Block page AI panel.
- Access-state enforcement for `ALLOW` via temporary unlock.
- Access-state enforcement foundation for block holds and cooldowns.
- `AIReadiness` derived state.
- Send-first UX that auto-starts an AI Check session.
- Provider client timeout and typed provider error classification.
- Provider contract coverage for OpenAI, DeepSeek, and Kimi Chat Completions request shape.
- JSON parsing with enum validation for decision categories.
- Tolerant normalization for non-critical provider category labels so a valid decision is not rejected only because `reasoningCategory` wording differs.
- Decision-specific validation constraints for `ALLOW`, `AI_COOLDOWN`, and `ASK_MORE`.
- Strictness-derived AI cooldown ranges with light normalization for small provider mistakes.
- Final-turn validation: `ASK_MORE` is rejected on the final assistant turn.
- AI cooldown session fields, countdown state, blocked-send event logging, and same-session recovery after the timer.
- Meter-first decision tendency UI with raw scores kept in details.
- Optimistic chat behavior: user bubble appears before provider completion, followed by a thinking state.
- Enter-to-send behavior with Shift+Enter newline.
- Same-session repeated reasons no longer increment historical pattern memory multiple times.
- AI `BLOCK` hold suppresses Basic Cooldown UI and background cooldown unlock creation.
- Decision meter marker and fill animate smoothly between turns with reduced-motion support.
- `schema_error` session status for validation failures.
- AI Check readiness based on saved provider key, valid model, and access state.
- Live AI readiness refresh for already-open block pages after provider key save/delete.
- Pattern memory updates are driven by validated decisions and deduped inside the same continuous session.
- Local PM review workspace can convert bad cases into AI Check eval cases.
- Local AI Check eval runner covers authored boundary cases in mock mode.

## Not Yet Implemented

- Unified AI Check session status model.
- Real-provider manual verification for OpenAI, DeepSeek, and Kimi with live keys.
- Persisted provider eval run history for release gating.
- Full UI affordances for inspecting unified case `input`, `output`, and `eval` sections.
- Broader E2E coverage for provider failure variants.

## Recommended Next Milestone

Milestone name:

```text
AI Check Session State Machine Foundation
```

Scope:

1. Add `AIReadiness` derivation.
2. Normalize provider/model/key readiness into one UI contract.
3. Add provider client for OpenAI-compatible Chat Completions.
4. Add provider error taxonomy.
5. Add JSON decision parser and validator.
6. Refactor session service around explicit state transitions.
7. Implement `ASK_MORE`, `AI_COOLDOWN`, `ALLOW`, and `BLOCK` effects.
8. Update Block page UI to render by state.
9. Add E2E tests for success, product denial, and technical failures.

## Validation Status

Latest validation:

```bash
npm --workspace apps/extension run build
npm --workspace apps/extension run test:e2e
```

Known latest passing assertions before this design:

- `TAB_ATTEMPT_MAPPING_OK true`
- `COOLDOWN_UNLOCK_OK true`
- `IN_PAGE_WARNING_OK true`
- `UNLOCK_EXPIRY_OK true`
- `AI_CHECK_OK true`
- `REVIEW_OK true`
- `DELETED_TARGET_RECOVERY_OK true`

Additional current validation:

- Existing E2E passes after send-first UX.
- Build passes after provider timeout/error classification and stricter schema validation.
- 2026-05-20 validation passed:
  - `npm --workspace apps/extension run test:ai-check`
  - `npm --workspace apps/extension run eval:ai-check` passed 42/42 in mock mode
  - `npm --workspace apps/extension run test:e2e`
  - `git diff --check`

## Synchronization Note

2026-05-12:

- Design doc created.
- Issues doc created with open implementation issues.
- No code changes in this checkpoint.

2026-05-12:

- Implemented first AI Check session foundation slice.
- Issues doc updated:
  - ISSUE-001 partially complete; real provider verification still needed.
  - ISSUE-002 partially complete; provider client now has timeout/error taxonomy, but manual provider verification remains.
  - ISSUE-003 partially complete; schema/constraint validation added, but failure E2E is still needed.
  - ISSUE-007 closed; send-first UX is implemented and covered by existing AI E2E path.

2026-05-17:

- Removed lifetime license state, dev unlock/reset routes, Demo AI provider behavior, AI PM mode, and AI PM review/eval workspace.
- Settings now frames AI Check as local provider setup without paywall UI.
- Access-state design/progress/issues docs were checked and updated because license/demo/AIPM removal changes readiness semantics and validation scope.

2026-05-18:

- Removed the Settings AI Check status badge and residual paywall framing.

2026-05-17:

- Added provider-key readiness invalidation so an already-open block page updates from `missing_provider_key` to `ready` after Settings saves a key.
- E2E now covers `PROVIDER_KEY_LIVE_REFRESH_OK true`.

2026-05-17:

- Updated the AI Check implementation plan for strictness-derived AI cooldown ranges.
- Clarified that the final assistant turn must produce `ALLOW`, `BLOCK`, or `AI_COOLDOWN`; `ASK_MORE` is invalid on the final turn.
- Clarified that the Block page decision summary should be meter-first, with raw scores in secondary details.
- Issues doc was checked and updated because AI cooldown, final-turn behavior, and decision UI now have more specific implementation requirements.

2026-05-17:

- Implemented strictness-derived AI cooldown policies for `gentle`, `balanced`, `strict`, and `monk`.
- Implemented AI cooldown normalization, lifecycle event logging, countdown UI, blocked-send protection, and same-session recovery after the timer.
- Implemented final-turn context and validation so `ASK_MORE` is rejected on the final assistant turn.
- Implemented meter-first decision summary UI and extracted its calculation into a testable helper.
- Added `test:ai-check` for cooldown normalization, final-turn validation, and meter behavior.
- Latest validation:
  - `npm --workspace apps/extension run test:ai-check`
  - `npm --workspace apps/extension run typecheck`
  - `npm --workspace apps/extension run build`
  - `npm --workspace apps/extension run test:e2e`

2026-05-18:

- Rechecked official OpenAI, DeepSeek, and Kimi API docs for Chat Completions compatibility.
- Updated DeepSeek to the official OpenAI-format base URL and Kimi to `https://api.moonshot.ai/v1`.
- Updated Kimi default model to `kimi-k2.6` and refreshed the model registry.
- Removed non-official OpenAI `gpt-5.5-pro` from the selectable API model list.
- Added provider contract assertions for OpenAI, DeepSeek, and Kimi request URLs and JSON mode body.
- Added tolerant category normalization to avoid `schema_error` when a provider returns a semantically valid decision with a non-exact `reasoningCategory`.
- Added Enter-to-send and desktop right-side Send button layout.
- Latest validation:
  - `npm --workspace apps/extension run test:ai-check`
  - `npm --workspace apps/extension run typecheck`
  - `npm --workspace apps/extension run test:e2e`

2026-05-18:

- Clarified that repeated reason is historical across sessions and should not increment multiple times inside one continuous AI Check session.
- Clarified optimistic chat UX and assistant thinking-state requirements.
- Clarified that AI-created block holds outrank Basic Cooldown controls and unlock creation.
- Clarified meter animation and decision header spacing requirements.

2026-05-18:

- Implemented optimistic message rendering, thinking bubble, auto-scroll, and IME-safe Enter-to-send.
- Implemented same-session pattern-memory dedupe so repeated `ASK_MORE` turns do not inflate historical repeated reason counts.
- Implemented AI hold priority over Basic Cooldown in both UI and background handlers.
- Implemented smoother meter marker/fill transitions and decision header spacing.
- Latest validation:
  - `npm --workspace apps/extension run test:ai-check`
  - `npm --workspace apps/extension run typecheck`
  - `npm --workspace apps/extension run build`
  - `npm --workspace apps/extension run test:e2e`

2026-05-18:

- Added held read-only design requirement: active holds should show the last blocked AI conversation and decision instead of a blank new chat.
- Issues doc was updated with ISSUE-013.
- Implemented held read-only mode:
  - block page loads the latest blocked AI session for the held target.
  - previous conversation and final decision render read-only.
  - composer is disabled with a hover/focus unavailable overlay.
  - background AI Check start/send handlers reject new negotiation while the hold is active.
- Closed ISSUE-013.
- Latest validation:
  - `npm --workspace apps/extension run test:ai-check`
  - `npm --workspace apps/extension run typecheck`
  - `npm --workspace apps/extension run build`
  - `npm --workspace apps/extension run test:e2e`

## Update Checklist

When this progress doc changes, check:

- Design doc: does implementation reveal a design gap?
- Issues doc: should a completed issue be closed or a new implementation issue be added?
