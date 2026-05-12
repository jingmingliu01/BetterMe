# 2026-05-12 AI Track State Machine Issues

Related docs:

- Design: [2026-05-12-ai-track-state-machine-design.md](2026-05-12-ai-track-state-machine-design.md)
- Progress: [2026-05-12-ai-track-state-machine-progress.md](2026-05-12-ai-track-state-machine-progress.md)
- Access state issues: [2026-05-12-access-state-issues.md](2026-05-12-access-state-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Open Issues

### ISSUE-001: UI AI readiness can disagree with real provider readiness

Status: open

Observed behavior:

- Block page can show `AI ready`.
- Sending a message can still fail with `BetterMe background did not respond`.

Expected behavior:

- AI Chat should render from a single `AIReadiness` derived state.
- Provider/model/key readiness should be checked before enabling send.
- Technical failures should show classified messages.

Design reference:

- [AI Readiness](2026-05-12-ai-track-state-machine-design.md#ai-readiness)

### ISSUE-002: Real provider calls need a unified OpenAI-compatible client

Status: open

Current risk:

- Provider behavior can diverge between OpenAI, DeepSeek, and Kimi.
- Timeout, invalid key, invalid model, quota, and schema failures are not clearly separated.

Expected behavior:

- All providers use one provider client interface.
- Provider errors are classified into stable app-level codes.
- UI displays actionable technical errors.

Design reference:

- [Provider Client](2026-05-12-ai-track-state-machine-design.md#provider-client)
- [Error Taxonomy](2026-05-12-ai-track-state-machine-design.md#error-taxonomy)

### ISSUE-003: Provider output must be schema-validated before enforcement

Status: open

Current risk:

- A malformed provider response could break the chat or accidentally bypass intended flow.

Expected behavior:

- Parse and validate JSON before applying any decision.
- Invalid JSON or invalid constraints should produce `schema_error`.
- No unlock should be created on schema failure.

Design reference:

- [Required JSON Output](2026-05-12-ai-track-state-machine-design.md#required-json-output)

### ISSUE-004: DELAY needs same-track continuation

Status: open

Current risk:

- `DELAY` may be treated as an endpoint or require a new track.

Expected behavior:

- `DELAY` keeps the same AI Track.
- UI shows countdown.
- After countdown, user can continue in the same conversation.

Design reference:

- [DELAY](2026-05-12-ai-track-state-machine-design.md#delay)

### ISSUE-005: ASK_MORE needs clear continuation semantics

Status: open

Current risk:

- `ASK_MORE` can look like a failure or terminal decision.

Expected behavior:

- `ASK_MORE` appends `nextQuestion`.
- The same track remains active.
- Turn count increments.
- User can answer without creating a new track.

Design reference:

- [ASK_MORE](2026-05-12-ai-track-state-machine-design.md#ask_more)

### ISSUE-006: BLOCK needs stronger hold-until-tomorrow UX

Status: open

Current risk:

- AI `BLOCK` may not communicate that this target is held until local next midnight.

Expected behavior:

- Create `BlockHold`.
- Display blocked-until time.
- Disable AI Check for that target during hold.
- Keep Leave Site and Settings available.

Design reference:

- [BLOCK](2026-05-12-ai-track-state-machine-design.md#block)

### ISSUE-007: Send-first UX should replace explicit start requirement

Status: open

Current risk:

- Separate `Start AI Track` introduces friction and ambiguous state.

Expected behavior:

- User sees local opening message.
- User types reason and clicks Send.
- If no track exists, app starts one automatically, then sends the message.

Design reference:

- [Start And Send Flow](2026-05-12-ai-track-state-machine-design.md#start-and-send-flow)

## Closed Issues

No closed issues yet for this design topic.
