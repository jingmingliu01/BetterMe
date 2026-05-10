# AI Check Spec

## Purpose

AI Check is a bounded AI-guided checkpoint. The user tries to convince the AI that continuing is deliberate rather than impulsive.

It must:

- Be bounded.
- Be non-shaming.
- Remember repeated excuses through summaries and Pattern Memory.
- Return structured decisions only.
- Never be the sole source of enforcement; the extension clamps and validates decisions.

## Availability

AI Check is usable only when:

- Lifetime License is unlocked.
- Provider is configured.
- API key is saved and decryptable.
- Selected model is configured.
- No active block hold prevents this target.

If unavailable, the chatbot panel stays visible but disabled with a clear reason.

## Opening Message

When license and key are ready, the first assistant message is generated locally. It does not call the LLM.

Template:

```text
You're trying to open {displayTarget}. What are you here to do, and why now?
```

Rules:

- `{displayTarget}` must be the real normalized target.
- This message is stored as an assistant message.
- It is included in future LLM context.
- It does not count as an LLM assistant turn.

## Track Limits

Default limits:

- Maximum 5 LLM assistant turns.
- Maximum 10 minutes.
- One final enforceable decision.

`ASK_MORE` counts as an assistant turn.

The local opening message does not count as one of the 5 LLM assistant turns.

## Decisions

### ALLOW

Effect:

- Create temporary unlock.
- Unlock duration may be suggested by LLM.
- Extension clamps duration by Strictness cap.

Default caps:

- Gentle: 30 minutes.
- Balanced: 15 minutes.
- Strict: 10 minutes.
- Monk: 5 minutes.

### DELAY

Effect:

- Show delay timer.
- Target remains blocked.
- After timer ends, user continues same track.

### ASK_MORE

Effect:

- AI asks one more question.
- No timer.
- Same track continues.

### BLOCK

Effect:

- Target blocked until local next day 00:00.
- Same target cannot start a new AI Track during hold.
- User can still Leave Site / Close Tab.

## Track State Machine

```text
locked
  -> unavailable

ready
  -> active

active
  -> ask_more
  -> delayed
  -> allowed
  -> blocked
  -> expired
  -> provider_error

delayed
  -> active

allowed
  -> completed

blocked
  -> completed

expired
  -> completed
```

## Data Model

```ts
type AIDecision = "ALLOW" | "DELAY" | "ASK_MORE" | "BLOCK";

interface AITrack {
  id: string;
  targetId: string;
  targetDisplay: string;
  status:
    | "active"
    | "delayed"
    | "allowed"
    | "blocked"
    | "expired"
    | "provider_error"
    | "completed";
  startedAt: string;
  expiresAt: string;
  completedAt?: string;
  assistantTurnCount: number;
  maxAssistantTurns: number;
  finalDecision?: AIDecision;
}

interface AITrackMessage {
  id: string;
  trackId: string;
  role: "system" | "assistant" | "user";
  content: string;
  source: "local_opening" | "user" | "llm";
  createdAt: string;
}
```

## Structured Output Schema

```ts
interface CheckpointDecision {
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

Validation rules:

- `decision` is required.
- `userFacingMessage` is required.
- `unlockMinutes` required only for `ALLOW`.
- `delaySeconds` required only for `DELAY`.
- `nextQuestion` required only for `ASK_MORE`.
- Scores should be numbers from 0 to 1.
- Invalid JSON triggers one retry.
- Invalid after retry becomes provider_error, not an enforceable decision.

## Context Layers

Do not send all raw history. Build compact context:

1. Gate Constitution.
2. User Profile.
3. Pattern Memory.
4. Recent Track Summaries.
5. Current Track messages.

### Gate Constitution

Stable behavior rules:

- Non-shaming tone.
- No explicit sexual content generation.
- No moral judgment.
- Focus on deliberate vs impulsive decision.
- Challenge repeated excuses.
- Respect Strictness.
- Return JSON only.

### User Profile

Includes:

- Strictness.
- Goals.
- Blocked target category.
- Preferred tone.
- Max turns per track.

### Pattern Memory

Includes:

- Common repeated reasons.
- High-risk time windows.
- Recurring impulse patterns.
- AI guidance for future sessions.

### Recent Track Summaries

Include only recent relevant summaries, not raw full transcripts.

### Current Track

Includes:

- Current target.
- Local time.
- Opening message.
- Current conversation messages.

## Provider Errors

Unavailable states:

| Error | UI behavior |
| --- | --- |
| License locked | Show locked AI panel. |
| API key missing | Show setup prompt. |
| API key invalid | Show invalid key message and link to settings. |
| Provider balance/rate limit | Show provider error, keep blocker active. |
| Network failure | Show retry button. |
| Invalid model output | Show invalid response after one retry. |

Provider errors never allow the target.

## Track Summary

At completion, save:

```ts
interface AITrackSummary {
  id: string;
  trackId: string;
  targetDisplay: string;
  decision: AIDecision;
  reasonCategory: string;
  summary: string;
  createdAt: string;
}
```

Summary can be generated by:

- LLM in the structured output if enough.
- Local deterministic summarization for MVP.

## Pattern Memory Update

Update Pattern Memory when:

- A repeated reason is detected.
- A high-risk time window appears.
- User uses the same reason category frequently.
- AI decision is BLOCK or DELAY due to repeated excuse.

