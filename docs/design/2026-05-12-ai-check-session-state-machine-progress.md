# 2026-05-12 AI Check Session State Machine Progress

Related docs:

- Design: [2026-05-12-ai-check-session-state-machine-design.md](2026-05-12-ai-check-session-state-machine-design.md)
- Issues: [2026-05-12-ai-check-session-state-machine-issues.md](2026-05-12-ai-check-session-state-machine-issues.md)
- Access state progress: [2026-05-12-access-state-progress.md](2026-05-12-access-state-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Implementation has started on the AI Check session feature branch.

The current product now has the first state-machine foundation pieces: derived AI readiness, send-first UX, typed provider errors, AI-specific message timeout, and stricter decision validation.

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
- JSON parsing with enum validation for decision categories.
- Decision-specific validation constraints for `ALLOW`, `AI_COOLDOWN`, and `ASK_MORE`.
- `schema_error` session status for validation failures.
- AI Check readiness based on saved provider key, valid model, and access state.
- Live AI readiness refresh for already-open block pages after provider key save/delete.

## Not Yet Implemented

- Unified AI Check session status model.
- Real-provider manual verification for OpenAI, DeepSeek, and Kimi.
- Full AI cooldown continuation inside same session.
- Full `ASK_MORE` continuation inside same session.
- Strong `BLOCK` UX with hold-until-tomorrow display.
- Pattern memory updates driven by validated decisions.
- E2E coverage for all decision outcomes and provider failures.

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

## Update Checklist

When this progress doc changes, check:

- Design doc: does implementation reveal a design gap?
- Issues doc: should a completed issue be closed or a new implementation issue be added?
