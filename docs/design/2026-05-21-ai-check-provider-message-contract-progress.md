# 2026-05-21 AI Check Provider Message Contract Progress

Related docs:

- Design: [2026-05-21-ai-check-provider-message-contract-design.md](2026-05-21-ai-check-provider-message-contract-design.md)
- Issues: [2026-05-21-ai-check-provider-message-contract-issues.md](2026-05-21-ai-check-provider-message-contract-issues.md)
- PM Review workspace progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Implemented locally.

The runtime now builds provider messages in cache-friendly order:

```text
system: static AI Check contract prompt
user: trusted round context
assistant/user: append-only conversation
user: trusted turn context
```

The prompt version has been bumped to the current contract prompt version because the provider-visible message arrangement changed materially.

## Already Exists

- Contract-first source at `apps/extension/src/shared/ai-check-contract.json`.
- Runtime prompt builder at `apps/extension/src/ai/prompt.ts`.
- Runtime message builder at `apps/extension/src/ai/context-builder.ts`.
- Provider calls reuse `messages` through `requestCheckpointDecision`.
- Provider-mode evals reuse the runtime message builder.
- PM Review Contract Manual can display generated prompt parts with provenance highlights.
- Local validation rejects invalid final-turn `ASK_MORE`.
- Static contract prompt, trusted round context, trusted turn context, and provider message assembly builders.
- Explicit `AICheckSession.roundSnapshot` for round-stable strictness, policy, memory, version, and provider/model snapshots.
- Provider-mode evals use the same provider message builder as live AI Check.

## Planned Scope

### Phase 1: Builder split

- Done: add static contract prompt builder.
- Done: add trusted round context builder.
- Done: add trusted turn context builder.
- Done: add provider message builder with stable prefix ordering.
- Done: add tests for stable prompt/round prefix across turns.

### Phase 2: Round snapshot

- Done: define explicit round snapshot shape.
- Done: capture strictness, policy, pattern memory, version, and provider/model snapshots at round start.
- Done: provider calls and enforcement use the round snapshot strictness instead of live Settings strictness for active rounds.

### Phase 3: Runtime and eval migration

- Done: migrate live AI Check provider calls to the new provider message builder.
- Done: keep provider repair messages after stable prefix sections.
- Done: update provider-mode evals and fixtures.
- Done: bump prompt version after the provider-visible message arrangement changed.

### Phase 4: PM Review Contract Manual

- Done: update Contract Manual tabs to show System Prompt, Round Context, Conversation, Turn Context, Provider Messages, Output, Evaluation, and Compare.
- Done: show provider message array shape in PM Review.
- Done: preserve source/provenance inspector behavior for generated non-user blocks.

### Phase 5: Cleanup

- Done: remove mixed System Prompt assumptions from runtime provider message assembly.
- Done: update linked docs and `AGENTS.md` with provider message ordering and round snapshot rules.

## Validation Status

Implemented and validated locally.

Validation performed:

- `npm --workspace apps/extension run typecheck`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check`
- `npm --workspace apps/extension run test:e2e`
- `git diff --check`
- Packaged `review.html` Playwright tab check for System Prompt, Round Context, Conversation, Turn Context, Provider Messages, Output, Evaluation, and Compare.

Pending validation:

- Browser visual polish pass with a populated local review dataset.

## Synchronization Note

2026-05-21:

- Created this design/progress/issues doc set.
- Checked PM Review workspace docs because Schema Reference / Contract Manual behavior is in scope.
- Implemented the provider message contract split in runtime code.
- Updated `AGENTS.md` because the provider message ordering and round snapshot behavior are now project policy.
- Validated typecheck, AI Check logic tests, eval fixtures, e2e, diff whitespace, and PM Review Contract Manual tab rendering.
