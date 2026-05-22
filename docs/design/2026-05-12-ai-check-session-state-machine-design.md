# 2026-05-12 AI Check Session State Machine Design

Related docs:

- Progress: [2026-05-12-ai-check-session-state-machine-progress.md](2026-05-12-ai-check-session-state-machine-progress.md)
- Issues: [2026-05-12-ai-check-session-state-machine-issues.md](2026-05-12-ai-check-session-state-machine-issues.md)
- Access state foundation: [2026-05-12-access-state-design.md](2026-05-12-access-state-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

AI Check is not open-ended chat. It is a bounded checkpoint where the user tries to prove that visiting a blocked site is deliberate rather than impulsive.

The AI is a private gatekeeper:

- Ask for intent.
- Challenge repeated excuses.
- Evaluate risk.
- Return one structured decision.
- Let local extension state enforce the decision.

The AI must not shame the user, generate explicit sexual content, make moral judgments, or read page content.

## Core Principle

Separate conversation, provider execution, validation, and enforcement.

Conversation:

- `AICheckSession`
- `AICheckMessage`
- local opening message
- bounded assistant turns and time window

Provider execution:

- selected provider
- selected model
- encrypted local API key
- OpenAI-compatible Chat Completions request for OpenAI, DeepSeek, and Kimi

Validation:

- JSON parse
- decision schema validation
- decision-specific constraints

Enforcement:

- `ALLOW` creates `TemporaryUnlock`
- `AI_COOLDOWN` creates delay state inside same session
- `ASK_MORE` appends one question inside same session
- `BLOCK` creates `BlockHold` until local next midnight

No provider result may directly mutate browser access before validation.

## AI Readiness

The UI should not decide AI availability with scattered booleans.

Define a derived state:

```ts
type AIReadiness =
  | "ready"
  | "missing_provider_key"
  | "invalid_provider_model"
  | "blocked_by_hold"
  | "cooling_down"
  | "temporarily_unlocked"
  | "target_missing";
```

Meaning:

- `ready`: user can send a message and create/continue an AI Check session.
- `missing_provider_key`: selected provider has no saved API key.
- `invalid_provider_model`: saved model is no longer in provider registry.
- `blocked_by_hold`: target has active `BlockHold`.
- `cooling_down`: Basic Cooldown is active.
- `temporarily_unlocked`: access is already allowed temporarily.
- `target_missing`: target was deleted or cannot be resolved.

The block page should render AI Chat from `AIReadiness`, not from duplicated local checks.

## Track State Model

```ts
type AICheckSessionStatus =
  | "idle"
  | "starting"
  | "active"
  | "waiting_user"
  | "thinking"
  | "ai_cooling_down"
  | "allowed"
  | "blocked"
  | "provider_error"
  | "schema_error"
  | "expired"
  | "completed";
```

User-facing states can be simpler:

- Ready
- Thinking
- Need one more answer
- AI cooldown timer
- Allowed
- Blocked until tomorrow
- AI unavailable

Rules:

- One AI Check session has maximum 5 assistant turns.
- One AI Check session has maximum 10 minutes.
- `ASK_MORE` stays in the same session.
- `AI_COOLDOWN` stays in the same session and resumes after the timer.
- `ALLOW` and `BLOCK` are terminal enforcement decisions.
- On the final assistant turn, `ASK_MORE` is invalid. The model must choose `ALLOW`, `BLOCK`, or `AI_COOLDOWN`.
- Provider errors are technical failures, not user failures.

## Start And Send Flow

The local opening message is shown before any provider call.

Recommended UX:

```text
blocked page
  -> local opening message appears
  -> user types reason and clicks Send
  -> if no session exists, create AICheckSession
  -> append user message
  -> call provider
  -> validate provider JSON
  -> append assistant message
  -> apply decision
```

This removes the need for a separate `Start AI Check session` click in the main path.

The chat UI must be optimistic:

- The user's message bubble appears immediately after Send or Enter.
- The input clears immediately.
- An assistant thinking state appears while the provider request is pending.
- The provider result replaces the thinking state with the validated assistant message and decision.
- If the provider fails, the user's message remains visible and the error is shown below the conversation.
- Enter sends the current message, Shift+Enter inserts a newline, and IME composition must not accidentally send.

## Provider Client

All selected providers for MVP should use OpenAI-compatible Chat Completions.

Current provider endpoints:

- OpenAI: `https://api.openai.com/v1/chat/completions`
- DeepSeek: `https://api.deepseek.com/chat/completions`
- Kimi: `https://api.moonshot.ai/v1/chat/completions`

Each request must send `model`, `messages`, `temperature`, and `response_format: { "type": "json_object" }`.

```ts
interface ProviderRequest {
  providerId: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  responseFormat: "json_object";
  timeoutMs: number;
}
```

Provider call location:

```text
BlockPage
  -> chrome.runtime.sendMessage(ai/sendMessage)
  -> background/service worker
  -> ai/provider-client
  -> provider API
```

Reason:

- UI does not decrypt or handle provider keys.
- Error taxonomy is centralized.
- JSON validation is centralized.
- Future backend/Codex-server migration is easier.

Provider key save/delete should publish only a non-sensitive readiness invalidation signal, not key material, so already-open block pages can refresh AI readiness without a reload.

## Prompt Context Layers

Do not send raw full history.

MVP context:

- Gate Constitution
- User strictness level
- AI cooldown range for the current strictness level
- current assistant turn count, maximum turns, and whether this request is the final turn
- selected tone
- current target display
- attempted URL
- local time
- recent pattern notes for this target
- current session messages

Future context:

- Recent session summaries
- Pattern memory with repeated reason counters
- High-risk time windows

Repeated reason semantics:

- `repeatedReason` is a historical signal across sessions, days, cooldowns, removals/re-adds, or prior terminal decisions.
- Repeating the same reason inside one continuous AI Check session should not increment historical repeated-count memory multiple times.
- Same-session repetition can still make the current answer vague or weak, but that is current-session deliberateness, not historical repetition.
- Pattern memory should update at most once per session/reason category, preferably when the session reaches a terminal decision or summary-worthy outcome.

## Required JSON Output

Provider output must validate against:

```ts
interface CheckpointDecisionPayload {
  decision: "ALLOW" | "AI_COOLDOWN" | "ASK_MORE" | "BLOCK";
  userFacingMessage: string;
  decisionReasonCategory:
    | "repeated_excuse"
    | "clear_intention"
    | "high_risk_pattern"
    | "low_risk"
    | "insufficient_reason";
  unlockMinutes: number | null;
  aiCooldownSeconds: number | null;
  scores: {
    repeatedReason: number;
    impulse: number;
    deliberateness: number;
  };
  memoryUpdate: {
    behaviorReasonCategory:
      | "stress"
      | "boredom"
      | "loneliness"
      | "escape"
      | "habit"
      | "intentional"
      | "other";
    patternNote: string | null;
  };
}
```

Decision-specific validation:

- `ALLOW`: `unlockMinutes` must be positive and within strictness cap.
- `AI_COOLDOWN`: `aiCooldownSeconds` must be positive and fit the strictness-derived AI cooldown policy.
- `ASK_MORE`: `userFacingMessage` must be a concrete follow-up question.
- Final turn: `ASK_MORE` is rejected even if `userFacingMessage` asks a valid question.
- `BLOCK`: no unlock should be created.

Schema failure:

- Mark session as `schema_error`.
- Show a technical error.
- Do not unlock.

## Decision Enforcement

### ALLOW

Meaning:

- The user gave a specific, bounded, deliberate reason.

Local effects:

- Create `TemporaryUnlock`.
- Rebuild DNR rules.
- Navigate to tab-level attempted URL.
- Save summary.
- Update pattern memory.

### AI Cooldown

Meaning:

- The user may be able to justify access, but the current reason is weak or impulsive.
- AI cooldown duration is correlated with Strict Mode, but not fixed by it.
- The AI may choose within the range for the current strictness level:
  - `gentle`: 30 seconds to 3 minutes, default 1 minute.
  - `balanced`: 1 minute to 5 minutes, default 2 minutes.
  - `strict`: 3 minutes to 10 minutes, default 5 minutes.
  - `monk`: 5 minutes to 20 minutes, default 10 minutes.

Local effects:

- Keep site blocked.
- Set `session.status = "ai_cooling_down"`.
- Store `aiCooldownStartedAt`, `aiCooldownUntil`, `aiCooldownSeconds`, and the cooldown decision id.
- Show countdown.
- After countdown, allow same session to continue.
- Do not consume or create a new session.
- If the provider returns a slightly out-of-range cooldown, clamp it to the strictness range and record the normalization.
- If the provider returns a nonsensical cooldown, reject it as a schema error.

### ASK_MORE

Meaning:

- AI cannot decide yet.

Local effects:

- Append `userFacingMessage` as assistant message.
- Increment assistant turn count.
- Keep same session active.
- Do not unlock or hold.

### BLOCK

Meaning:

- The reason is high risk, repeated, or clearly impulsive.

Local effects:

- Create `BlockHold` until local next midnight.
- Rebuild DNR rules.
- Mark session blocked/completed.
- Save summary.
- Update pattern memory.
- AI-created hold outranks Basic Cooldown. While the hold is active, Basic Cooldown start/continue controls must be unavailable and background handlers must reject cooldown unlock creation.

### Held Read-Only Mode

When a target has an active AI-created hold, AI Check is closed until the hold expires.

Rules:

- Do not show a blank new AI Check conversation.
- Load the latest AI Check session for the target whose final decision was `BLOCK`.
- Show that session's conversation, final decision card, and real turn count as read-only evidence.
- If no matching session exists, show a closed-state fallback instead of the local opening prompt.
- The composer is disabled. Hovering or focusing the composer area should show a light unavailable affordance such as `Closed until tomorrow`.
- New AI Check negotiation is not allowed while the hold is active.

## Error Taxonomy

```ts
type ProviderErrorCode =
  | "missing_key"
  | "invalid_key"
  | "invalid_model"
  | "rate_limited"
  | "insufficient_quota"
  | "provider_timeout"
  | "network_error"
  | "bad_provider_response"
  | "unknown_provider_error";
```

Technical errors should disable AI Chat temporarily but leave non-AI controls usable:

- Leave Site
- Basic Cooldown
- Settings

Technical errors must never create unlocks.

## UI Contract

Right chat panel:

- turn count
- remaining session time
- message list
- meter-first decision summary
- provider error card when relevant
- textarea/button state based on session status
- Enter sends the current message; Shift+Enter inserts a newline.
- Send button sits to the right of the chat box on desktop and stacks below it on narrow screens.
- Held read-only mode displays the last blocked AI conversation and disables the composer with a clear unavailable affordance.

The decision summary should put the judgment meter ahead of raw scores:

- Left side means more blocked / cool down leaning.
- Right side means more allow leaning.
- Raw `impulse`, `deliberateness`, and `repeatedReason` scores stay available in secondary details.
- `AI_COOLDOWN` shows the timer as the primary next action, not as a terminal failure.
- The meter marker and fill should animate smoothly from the previous value to the new value after each turn, with `prefers-reduced-motion` respected.
- The decision header must keep label, title, and badge visually separated.

Left checkpoint panel:

- strictness
- access state
- AI readiness
- attempted URL
- Leave Site
- Basic Cooldown
- Settings

## Implementation Modules

Suggested modules:

- `src/ai/ai-readiness.ts`
  - `deriveAIReadiness(input)`
  - `getAIReadinessMessage(readiness)`

- `src/ai/provider-client.ts`
  - `sendProviderChatCompletion(input)`
  - `classifyProviderError(error)`

- `src/ai/decision-schema.ts`
  - `parseCheckpointDecision(raw)`
  - `validateDecisionConstraints(decision, strictness)`

- `src/ai/ai-check-session-state-machine.ts`
  - `startOrResumeSession(input)`
  - `applyDecision(input)`
  - `expireSessionIfNeeded(session)`

- `src/ai/context-builder.ts`
  - `buildSessionMessages(input)`

- `src/pages/block/BlockPage.tsx`
  - render from `AIReadiness`, `AICheckSessionStatus`, and `AccessState`

## Validation Plan

E2E or integration tests should cover:

- missing key disables AI Chat but keeps Basic Cooldown usable.
- saving provider key in Settings makes an already-open block page AI-ready without leaving the redirected page.
- invalid model shows provider/model error.
- provider timeout shows technical error and does not unlock.
- schema error does not unlock.
- provider contract test verifies OpenAI, DeepSeek, and Kimi all use Chat Completions with JSON mode.
- `ASK_MORE` asks another question in the same session.
- `AI_COOLDOWN` starts countdown and resumes same session.
- final turn rejects `ASK_MORE` and allows `ALLOW`, `BLOCK`, or `AI_COOLDOWN`.
- strictness-derived AI cooldown ranges are enforced and normalized when appropriate.
- decision summary renders as a meter before detailed scores.
- `ALLOW` creates temporary unlock and returns to attempted URL.
- `BLOCK` creates hold until tomorrow and keeps the site blocked.
- active hold reload shows the latest blocked session conversation and final decision read-only.
- active hold disables the AI composer with hover/focus unavailable affordance.
- active hold rejects new AI Check start/send requests until the hold expires.
- repeated reason pattern affects later prompt context.
