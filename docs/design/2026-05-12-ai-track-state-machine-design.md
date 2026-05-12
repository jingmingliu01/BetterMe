# 2026-05-12 AI Track State Machine Design

Related docs:

- Progress: [2026-05-12-ai-track-state-machine-progress.md](2026-05-12-ai-track-state-machine-progress.md)
- Issues: [2026-05-12-ai-track-state-machine-issues.md](2026-05-12-ai-track-state-machine-issues.md)
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

- `AITrack`
- `AITrackMessage`
- local opening message
- bounded assistant turns and time window

Provider execution:

- selected provider
- selected model
- encrypted local API key
- OpenAI-compatible Chat Completions request

Validation:

- JSON parse
- decision schema validation
- decision-specific constraints

Enforcement:

- `ALLOW` creates `TemporaryUnlock`
- `DELAY` creates delay state inside same track
- `ASK_MORE` appends one question inside same track
- `BLOCK` creates `BlockHold` until local next midnight

No provider result may directly mutate browser access before validation.

## AI Readiness

The UI should not decide AI availability with scattered booleans.

Define a derived state:

```ts
type AIReadiness =
  | "ready"
  | "locked_free"
  | "missing_provider_key"
  | "invalid_provider_model"
  | "blocked_by_hold"
  | "cooling_down"
  | "temporarily_unlocked"
  | "target_missing";
```

Meaning:

- `ready`: user can send a message and create/continue an AI Track.
- `locked_free`: Lifetime license is not unlocked.
- `missing_provider_key`: selected provider has no saved API key or demo model.
- `invalid_provider_model`: saved model is no longer in provider registry.
- `blocked_by_hold`: target has active `BlockHold`.
- `cooling_down`: Basic Cooldown is active.
- `temporarily_unlocked`: access is already allowed temporarily.
- `target_missing`: target was deleted or cannot be resolved.

The block page should render AI Chat from `AIReadiness`, not from duplicated local checks.

## Track State Model

```ts
type AITrackStatus =
  | "idle"
  | "starting"
  | "active"
  | "waiting_user"
  | "thinking"
  | "delayed"
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
- Delay timer
- Allowed
- Blocked until tomorrow
- AI unavailable

Rules:

- One AI Track has maximum 5 assistant turns.
- One AI Track has maximum 10 minutes.
- `ASK_MORE` stays in the same track.
- `DELAY` stays in the same track and resumes after the timer.
- `ALLOW` and `BLOCK` are terminal enforcement decisions.
- Provider errors are technical failures, not user failures.

## Start And Send Flow

The local opening message is shown before any provider call.

Recommended UX:

```text
blocked page
  -> local opening message appears
  -> user types reason and clicks Send
  -> if no track exists, create AITrack
  -> append user message
  -> call provider
  -> validate provider JSON
  -> append assistant message
  -> apply decision
```

This removes the need for a separate `Start AI Track` click in the main path.

## Provider Client

All selected providers for MVP should use OpenAI-compatible Chat Completions.

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

## Prompt Context Layers

Do not send raw full history.

MVP context:

- Gate Constitution
- User strictness level
- selected tone
- current target display
- attempted URL
- local time
- recent pattern notes for this target
- current track messages

Future context:

- Recent track summaries
- Pattern memory with repeated reason counters
- High-risk time windows

## Required JSON Output

Provider output must validate against:

```ts
interface CheckpointDecisionPayload {
  decision: "ALLOW" | "DELAY" | "ASK_MORE" | "BLOCK";
  userFacingMessage: string;
  reasoningCategory:
    | "repeated_excuse"
    | "clear_intention"
    | "high_risk_pattern"
    | "low_risk"
    | "insufficient_reason";
  unlockMinutes: number | null;
  delaySeconds: number | null;
  nextQuestion: string | null;
  scores: {
    repeatedReason: number;
    impulse: number;
    deliberateness: number;
  };
  memoryUpdate: {
    reasonCategory:
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
- `DELAY`: `delaySeconds` must be positive.
- `ASK_MORE`: `nextQuestion` must be non-empty.
- `BLOCK`: no unlock should be created.

Schema failure:

- Mark track as `schema_error`.
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

### DELAY

Meaning:

- The user may be able to justify access, but the current reason is weak or impulsive.

Local effects:

- Keep site blocked.
- Set `track.status = "delayed"`.
- Set `delayUntil`.
- Show countdown.
- After countdown, allow same track to continue.
- Do not consume or create a new track.

### ASK_MORE

Meaning:

- AI cannot decide yet.

Local effects:

- Append `nextQuestion` as assistant message.
- Increment assistant turn count.
- Keep same track active.
- Do not unlock or hold.

### BLOCK

Meaning:

- The reason is high risk, repeated, or clearly impulsive.

Local effects:

- Create `BlockHold` until local next midnight.
- Rebuild DNR rules.
- Mark track blocked/completed.
- Save summary.
- Update pattern memory.

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

Technical errors should disable AI Chat temporarily but leave free controls usable:

- Leave Site
- Basic Cooldown
- Settings

Technical errors must never create unlocks.

## UI Contract

Right chat panel:

- turn count
- remaining track time
- message list
- decision card
- provider error card when relevant
- textarea/button state based on track status

Left checkpoint panel:

- strictness
- access state
- AI readiness
- attempted URL
- Leave Site
- Basic Cooldown
- Settings
- AI PM Review

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

- `src/ai/track-state-machine.ts`
  - `startOrResumeTrack(input)`
  - `applyDecision(input)`
  - `expireTrackIfNeeded(track)`

- `src/ai/context-builder.ts`
  - `buildTrackMessages(input)`

- `src/pages/block/BlockPage.tsx`
  - render from `AIReadiness`, `AITrackStatus`, and `AccessState`

## Validation Plan

E2E or integration tests should cover:

- missing key disables AI Chat but keeps Basic Cooldown usable.
- invalid model shows provider/model error.
- provider timeout shows technical error and does not unlock.
- schema error does not unlock.
- `ASK_MORE` asks another question in the same track.
- `DELAY` starts countdown and resumes same track.
- `ALLOW` creates temporary unlock and returns to attempted URL.
- `BLOCK` creates hold until tomorrow and keeps the site blocked.
- repeated reason pattern affects later prompt context.
