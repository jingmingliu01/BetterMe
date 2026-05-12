# BetterMe AI Track State Machine

This document is the shareable version of the local working design under `doc/design/2026-05-12-ai-track-state-machine-*.md`.

## Product Intent

AI Check is a bounded checkpoint, not open-ended chat. The user tries to convince BetterMe that opening a blocked site is deliberate rather than impulsive.

The AI should:

- ask for intent,
- challenge repeated excuses,
- evaluate risk,
- return structured JSON,
- let local extension state enforce the result.

The AI should not shame the user, make moral judgments, generate explicit sexual content, or read page content.

## State Model

Use a derived readiness state:

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

Use a bounded track status:

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

## UX Flow

```text
blocked page
  -> local opening message appears
  -> user types reason and clicks Send
  -> if no track exists, create AITrack
  -> append user message
  -> call selected provider from background
  -> validate structured JSON
  -> apply ALLOW / DELAY / ASK_MORE / BLOCK
```

The main path should not require a separate `Start AI Track` click.

## Provider Architecture

OpenAI, DeepSeek, and Kimi should share one OpenAI-compatible Chat Completions client:

```text
BlockPage
  -> chrome.runtime.sendMessage(ai/sendMessage)
  -> background/service worker
  -> ai/provider-client
  -> provider API
```

The React UI should not decrypt or directly use provider API keys.

## Required Decision JSON

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

## Decision Effects

`ALLOW`:

- create `TemporaryUnlock`,
- rebuild DNR,
- return to attempted URL,
- save summary and pattern memory.

`DELAY`:

- keep blocked,
- show countdown,
- resume the same track after delay,
- do not create a new track.

`ASK_MORE`:

- append `nextQuestion`,
- keep same track active,
- do not unlock or hold.

`BLOCK`:

- create `BlockHold` until local next midnight,
- rebuild DNR,
- mark track completed,
- save summary and pattern memory.

## Technical Failures

Provider failures are not user failures. They should never unlock the site.

Stable error codes:

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

When AI fails technically, keep free controls available:

- Leave Site
- Basic Cooldown
- Settings

## Implementation Milestone

`AI Track State Machine Foundation`:

1. Add `AIReadiness` derivation.
2. Normalize provider/model/key readiness into one UI contract.
3. Add provider client for OpenAI-compatible Chat Completions.
4. Add provider error taxonomy.
5. Add JSON decision parser and validator.
6. Refactor track service around explicit state transitions.
7. Implement `ASK_MORE`, `DELAY`, `ALLOW`, and `BLOCK` effects.
8. Update Block page UI to render by state.
9. Add E2E tests for success, product denial, and technical failures.
