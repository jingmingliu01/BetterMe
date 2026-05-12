# 2026-05-12 AI Track State Machine Progress

Related docs:

- Design: [2026-05-12-ai-track-state-machine-design.md](2026-05-12-ai-track-state-machine-design.md)
- Issues: [2026-05-12-ai-track-state-machine-issues.md](2026-05-12-ai-track-state-machine-issues.md)
- Access state progress: [2026-05-12-access-state-progress.md](2026-05-12-access-state-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Design is drafted. Implementation is not started in this checkpoint.

The current product has a demo AI Track path, but AI Chat is not yet governed by a unified state machine.

## Already Exists

- `AITrack`, `AITrackMessage`, `CheckpointDecision` model types.
- Demo AI flow.
- Local encrypted provider key storage.
- Provider registry for OpenAI, DeepSeek, and Kimi.
- Block page AI panel.
- AI PM review workspace.
- Access-state enforcement for `ALLOW` via temporary unlock.
- Access-state enforcement foundation for block holds and cooldowns.

## Not Yet Implemented

- `AIReadiness` derived state.
- Unified AI Track status model.
- Send-first UX that auto-starts track.
- Provider client with typed error classification.
- OpenAI-compatible Chat Completions request path for real provider keys.
- JSON schema validation for provider output.
- Decision-specific validation constraints.
- Full `DELAY` continuation inside same track.
- Full `ASK_MORE` continuation inside same track.
- Strong `BLOCK` UX with hold-until-tomorrow display.
- Pattern memory updates driven by validated decisions.
- E2E coverage for all decision outcomes and provider failures.

## Recommended Next Milestone

Milestone name:

```text
AI Track State Machine Foundation
```

Scope:

1. Add `AIReadiness` derivation.
2. Normalize provider/model/key readiness into one UI contract.
3. Add provider client for OpenAI-compatible Chat Completions.
4. Add provider error taxonomy.
5. Add JSON decision parser and validator.
6. Refactor track service around explicit state transitions.
7. Implement `ASK_MORE`, `DELAY`, `ALLOW`, and `BLOCK` effects.
8. Update Block page UI to render by state.
9. Add E2E tests for success, product denial, and technical failures.

## Validation Status

No new validation was run for this design-only checkpoint.

Latest known general extension validation from prior access-state work:

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

## Synchronization Note

2026-05-12:

- Design doc created.
- Issues doc created with open implementation issues.
- No code changes in this checkpoint.

## Update Checklist

When this progress doc changes, check:

- Design doc: does implementation reveal a design gap?
- Issues doc: should a completed issue be closed or a new implementation issue be added?
