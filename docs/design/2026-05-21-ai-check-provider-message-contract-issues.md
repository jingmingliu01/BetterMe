# 2026-05-21 AI Check Provider Message Contract Issues

Related docs:

- Design: [2026-05-21-ai-check-provider-message-contract-design.md](2026-05-21-ai-check-provider-message-contract-design.md)
- Progress: [2026-05-21-ai-check-provider-message-contract-progress.md](2026-05-21-ai-check-provider-message-contract-progress.md)
- PM Review workspace issues: [2026-05-20-pm-review-workspace-issues.md](2026-05-20-pm-review-workspace-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Current System Prompt mixes stability levels

Status: closed in provider message contract slice

Risk:

- Turn-level values appear early in the first provider message.
- Provider prompt caching cannot reuse as much prefix as possible.
- PM Review labels turn-level controls as System Prompt content, which obscures the difference between cross-round rules and per-turn state.

Expected behavior:

- Static System Prompt contains only cross-round contract instructions.
- Round Context contains round-stable values.
- Turn Context contains per-turn values and is placed last.

Resolution:

- Static System Prompt now contains cross-round contract instructions only.
- Round Context carries round-stable target, strictness, policy, pattern memory, and version snapshots.
- Turn Context carries per-turn control and is placed last in provider messages.

### ISSUE-002: Round snapshot is not explicit enough

Status: closed in provider message contract slice

Risk:

- Mid-round Settings changes can accidentally affect an active round if runtime reads live settings every turn.
- Eval reproduction is harder if strictness/policy/pattern-memory snapshots are reconstructed implicitly.

Expected behavior:

- A round captures strictness, policy, versions, and pattern memory at round start.
- Current round behavior does not change when Settings changes mid-round.
- New Settings values apply to the next round.

Resolution:

- `AICheckSession.roundSnapshot` captures strictness, policy, versions, pattern memory, and provider/model at round start.
- Live provider calls and enforcement use the round snapshot strictness for active rounds.
- Settings changes can affect the next round without changing the current round snapshot.

### ISSUE-003: Role semantics must remain provider-compatible

Status: closed in provider message contract slice

Risk:

- Custom roles such as `round_system` or `turn_system` are not valid for OpenAI-compatible providers.
- Using `developer` everywhere may break non-OpenAI providers.
- Using `user` for trusted app context can be confusing unless the static System Prompt makes the authority clear.

Expected behavior:

- Compatibility path uses `system`, `user`, and `assistant` only.
- Trusted app context blocks are marked clearly inside content.
- Static System Prompt tells the model that trusted context blocks are app-supplied and authoritative.

Resolution:

- Compatibility path continues using only `system`, `user`, and `assistant`.
- Trusted Round Context and Trusted Turn Context are marked inside message content.
- Static System Prompt tells the model that trusted context blocks are app-supplied and authoritative.

### ISSUE-004: Prompt version and eval fixtures may need migration

Status: closed in provider message contract slice

Risk:

- Changing message arrangement can change model behavior even if output schema does not change.
- Existing eval fixtures may encode assumptions about the old generated System Prompt.
- Default eval runs may compare current runtime against stale prompt versions.

Expected behavior:

- If provider-visible prompt/message behavior changes materially, update `AI_CHECK_CONTRACT.promptVersion`.
- Current-version fixtures are reviewed, migrated, or archived.
- Provider-mode evals use the new runtime message builder.

Resolution:

- `AI_CHECK_CONTRACT.promptVersion` was bumped because the provider-visible message arrangement changed materially.
- Current eval fixtures were updated to the new prompt version.
- Provider-mode evals use the runtime provider message builder.

### ISSUE-005: PM Review Contract Manual must not drift after the split

Status: closed in provider message contract slice

Risk:

- PM Review may continue to show a single generated System Prompt even after runtime splits provider messages.
- Reviewers may not understand which sections are stable across rounds, stable within a round, append-only, or per-turn.

Expected behavior:

- Contract Manual shows the exact provider message array shape.
- It separates System Prompt, Round Context, Conversation, Turn Context, Output, and Evaluation.
- It highlights provenance for generated non-user blocks.

Resolution:

- Contract Manual now shows Provider Messages, Output, Evaluation, and Compare.
- Provider Messages contains the full `messages[]` tree. Generated non-user blocks keep provenance highlighting and lightweight source hints.
- Prompt/context preview now renders sectionized XML-like blocks from structured prompt parts so section boundaries and original line breaks are easier to inspect.
