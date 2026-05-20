# 2026-05-12 AI Check Session State Machine Issues

Related docs:

- Design: [2026-05-12-ai-check-session-state-machine-design.md](2026-05-12-ai-check-session-state-machine-design.md)
- Progress: [2026-05-12-ai-check-session-state-machine-progress.md](2026-05-12-ai-check-session-state-machine-progress.md)
- Access state issues: [2026-05-12-access-state-issues.md](2026-05-12-access-state-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-013: Held targets should show the last blocked AI session

Status: closed

Current risk:

- A target held until tomorrow can show an empty AI Check panel.
- The user cannot see the conversation and decision that caused the hold.
- The composer can look like it might still accept a new negotiation.

Expected behavior:

- Held state loads the latest blocked AI session for the target.
- Conversation and final decision render read-only.
- Composer is disabled with a clear unavailable hover affordance.
- New AI Check negotiation is rejected until the hold expires.

Design reference:

- [Held Read-Only Mode](2026-05-12-ai-check-session-state-machine-design.md#held-read-only-mode)

Resolution:

- Block page loads the latest blocked AI session for the held target.
- The previous conversation, final decision, and meter render read-only.
- The composer is disabled and shows a light hover/focus unavailable overlay.
- Background AI Check start/send handlers reject new negotiation while the hold is active.
- E2E covers prior conversation recovery, disabled composer affordance, Basic Cooldown suppression, and AI Check rejection.

### ISSUE-010: Chat should show the user message before provider completion

Status: closed

Current risk:

- The UI waits for the provider result before replacing the message list.
- The user's message and the assistant reply can appear at the same time, making the send action feel stalled.

Expected behavior:

- User message appears immediately.
- AI thinking state appears while the provider is pending.
- Provider result replaces the thinking state.
- Provider errors keep the user's message visible.

Design reference:

- [Start And Send Flow](2026-05-12-ai-check-session-state-machine-design.md#start-and-send-flow)

Resolution:

- Block page now appends an optimistic user bubble before the provider returns.
- A thinking bubble appears while the provider request is pending.
- The input clears immediately and the message list auto-scrolls.
- Provider errors keep the optimistic user message visible.
- E2E covers Enter-to-send, optimistic user bubble, and thinking state.

### ISSUE-011: Repeated reason should not count multiple times within one session

Status: closed

Current risk:

- Pattern memory updates after every decision, including repeated `ASK_MORE` turns in the same session.
- The model can interpret one continuous conversation as multiple historical repeats.

Expected behavior:

- Historical repeated count increments at most once per session/reason category.
- Same-session repetition can affect current-session quality but not historical repeated-count memory.

Design reference:

- [Prompt Context Layers](2026-05-12-ai-check-session-state-machine-design.md#prompt-context-layers)

Resolution:

- Pattern memory no longer updates on every `ASK_MORE`.
- Pattern memory updates only on terminal decisions or final-turn `AI_COOLDOWN`.
- The session records updated memory categories so a category is not counted twice within one session.
- E2E checks that a multi-turn same-session repeated reason increments historical memory only once.

### ISSUE-012: AI block hold should outrank Basic Cooldown

Status: closed

Current risk:

- A target held until tomorrow by AI may still expose Basic Cooldown.
- This lets the lower-friction shortcut bypass the higher-order AI decision.

Expected behavior:

- While an active hold exists, Basic Cooldown start/continue controls are unavailable.
- Background cooldown start/continue handlers reject active holds.

Design reference:

- [BLOCK](2026-05-12-ai-check-session-state-machine-design.md#block)

Resolution:

- Block page shows Basic Cooldown as unavailable while an active hold exists.
- Background `blocking/startCooldown` and `blocking/completeCooldown` reject active holds.
- E2E covers UI and background rejection.

### ISSUE-001: UI AI readiness can disagree with real provider readiness

Status: partially complete

Observed behavior:

- Block page can show `AI ready`.
- Sending a message can still fail with `BetterMe background did not respond`.

Expected behavior:

- AI Chat should render from a single `AIReadiness` derived state.
- Provider/model/key readiness should be checked before enabling send.
- Technical failures should show classified messages.

Design reference:

- [AI Readiness](2026-05-12-ai-check-session-state-machine-design.md#ai-readiness)

Current update:

- Added `AIReadiness` derived state.
- Block page now renders AI readiness from this state.
- AI send timeout is now longer for provider calls, so real LLM calls are not cut off by the generic 4-second UI timeout.
- Still needs manual verification with saved DeepSeek/OpenAI/Kimi keys.

### ISSUE-002: Real provider calls need a unified OpenAI-compatible client

Status: partially complete

Current risk:

- Provider behavior can diverge between OpenAI, DeepSeek, and Kimi.
- Timeout, invalid key, invalid model, quota, and schema failures are not clearly separated.

Expected behavior:

- All providers use one provider client interface.
- Provider errors are classified into stable app-level codes.
- UI displays actionable technical errors.

Design reference:

- [Provider Client](2026-05-12-ai-check-session-state-machine-design.md#provider-client)
- [Error Taxonomy](2026-05-12-ai-check-session-state-machine-design.md#error-taxonomy)

Current update:

- Existing OpenAI-compatible provider client now has a 30-second fetch timeout.
- Added stable provider error codes for invalid key, invalid model, rate limit, quota, timeout, network, bad response, and unknown errors.
- Rechecked official provider docs and aligned OpenAI, DeepSeek, and Kimi Chat Completions endpoints.
- Added provider contract coverage for request URL, `messages`, and JSON mode body.
- Still needs manual real-provider verification with live keys and more user-friendly error rendering.

### ISSUE-003: Provider output must be schema-validated before enforcement

Status: partially complete

Current risk:

- A malformed provider response could break the chat or accidentally bypass intended flow.

Expected behavior:

- Parse and validate JSON before applying any decision.
- Invalid JSON or invalid constraints should produce `schema_error`.
- No unlock should be created on schema failure.

Design reference:

- [Required JSON Output](2026-05-12-ai-check-session-state-machine-design.md#required-json-output)

Current update:

- Parser now validates `decision`, `reasoningCategory`, and `memoryUpdate.reasonCategory` enums.
- Added decision-specific validation for `ALLOW`, `AI_COOLDOWN`, and `ASK_MORE`.
- Session is marked `schema_error` on validation failures.
- Non-critical category labels are now normalized when possible so a valid provider decision is not rejected only because category wording differs.
- Still needs dedicated E2E coverage for malformed provider output.

### ISSUE-004: AI cooldown needs same-session continuation

Status: closed

Current risk:

- `AI_COOLDOWN` may be treated as an endpoint or require a new session.
- `AI_COOLDOWN` may not respect the user's Strict Mode if the model can choose any arbitrary delay.

Expected behavior:

- `AI_COOLDOWN` keeps the same AI Check session.
- UI shows countdown.
- After countdown, user can continue in the same conversation.
- AI cooldown duration is selected inside the current strictness-derived range.
- Slight provider range errors are normalized; nonsensical durations are rejected.

Design reference:

- [AI_COOLDOWN](2026-05-12-ai-check-session-state-machine-design.md#ai-cooldown)

Resolution:

- Added strictness-derived AI cooldown ranges and schema normalization.
- `AI_COOLDOWN` now stores timer fields on the existing session.
- The Block page disables composer while the AI cooldown is active and re-enables it after the timer.
- Behavior history records AI cooldown start, completion, blocked send attempts, and cooldown normalization.

### ISSUE-008: Final turn must force a concrete decision

Status: closed

Current risk:

- The service currently blocks sending once the turn limit is reached, but the final allowed turn can still ask for more information.
- This can leave the user at the limit without a concrete AI outcome.

Expected behavior:

- The final allowed assistant turn is still sent to the provider.
- The prompt tells the provider it is the final turn.
- Schema validation rejects `ASK_MORE` on the final turn.
- The final turn may return `ALLOW`, `BLOCK`, or `AI_COOLDOWN`.

Design reference:

- [Track State Model](2026-05-12-ai-check-session-state-machine-design.md#track-state-model)

Resolution:

- Session service now computes whether the next assistant response is the final turn.
- Prompt context tells the provider when the current request is final.
- Schema validation rejects `ASK_MORE` on the final turn.
- Behavior history records `ai_final_turn_reached`.

### ISSUE-009: Decision tendency should be meter-first

Status: closed

Current risk:

- Raw scores are useful for debugging, but they do not give the user an immediate sense of where the AI is leaning.

Expected behavior:

- The latest decision summary renders a visual meter first.
- The meter emphasizes whether the AI is leaning toward access, cooldown, or block.
- Raw score details remain available but secondary.

Design reference:

- [UI Contract](2026-05-12-ai-check-session-state-machine-design.md#ui-contract)

Resolution:

- The Block page decision summary now renders a meter before the explanatory message and raw details.
- The meter helper derives a bounded visual position and label from decision scores and the applied decision.
- Raw `impulse`, `deliberateness`, and `repeatedReason` remain available in details.

### ISSUE-005: ASK_MORE needs clear continuation semantics

Status: open

Current risk:

- `ASK_MORE` can look like a failure or terminal decision.

Expected behavior:

- `ASK_MORE` appends `nextQuestion`.
- The same session remains active.
- Turn count increments.
- User can answer without creating a new session.

Design reference:

- [ASK_MORE](2026-05-12-ai-check-session-state-machine-design.md#ask_more)

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

- [BLOCK](2026-05-12-ai-check-session-state-machine-design.md#block)

### ISSUE-007: Send-first UX should replace explicit start requirement

Status: closed

Current risk:

- Separate `Start AI Check session` introduces friction and ambiguous state.

Expected behavior:

- User sees local opening message.
- User types reason and clicks Send.
- If no session exists, app starts a session automatically, then sends the message.

Design reference:

- [Start And Send Flow](2026-05-12-ai-check-session-state-machine-design.md#start-and-send-flow)

Resolution:

- Block page no longer requires a separate `Start AI Check session` click.
- User types a reason and clicks `Send`.
- If no session exists, background handles `ai/startAndSend`, creates the session, appends the user message, and requests a decision.
- Existing E2E AI path now uses send-first behavior.
