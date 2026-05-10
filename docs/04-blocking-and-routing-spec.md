# Blocking and Routing Spec

## Goals

The blocking system must:

- Be privacy-first.
- Avoid reading page content.
- Avoid reading full browser history.
- Block user-defined targets reliably.
- Redirect blocked visits to BetterMe block page.
- Support temporary unlock, delay, cooldown, and block-until-next-day.

## Target Types

### Domain Target

User input:

```text
youtube.com
https://youtube.com
https://www.youtube.com/watch?v=abc
```

If user chooses domain blocking, normalize to:

```ts
{
  type: "domain",
  domain: "youtube.com",
  includeSubdomains: true
}
```

Matching:

- `youtube.com`
- `www.youtube.com`
- `m.youtube.com`
- `music.youtube.com`

Not matching:

- `notyoutube.com`
- `youtube.com.example.com`

### Exact URL Target

User input:

```text
https://www.youtube.com/shorts/abc123
```

If user chooses exact URL blocking, normalize to:

```ts
{
  type: "exactUrl",
  url: "https://www.youtube.com/shorts/abc123"
}
```

MVP matching:

- Exact URL only.
- No wildcard.
- No path prefix matching.
- Query params should be preserved unless normalization later explicitly changes this.

## Add Current Page UI

Default UI:

```text
Block this site
[Add youtube.com and subdomains]
```

Advanced collapsed UI:

```text
Advanced
[Only block this exact URL]
```

Rationale:

- Most users want domain blocking.
- Exact URL blocking is useful but should not complicate the default flow.

## DNR Redirect

Use `chrome.declarativeNetRequest` dynamic rules to redirect matching main-frame requests to:

```text
chrome-extension://{extensionId}/block.html?targetId={targetId}&url={encodedOriginalUrl}
```

The block page should display a normalized target:

- Domain target: `youtube.com`
- Exact URL target: `youtube.com/shorts/abc123`

Do not display long tracking query strings by default.

Reference:

- [chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)

## Temporary Unlocks

When AI decision is `ALLOW`, BetterMe creates a temporary unlock:

```ts
interface TemporaryUnlock {
  id: string;
  targetId: string;
  targetType: "domain" | "exactUrl";
  normalizedTarget: string;
  createdAt: string;
  expiresAt: string;
  sourceTrackId: string;
}
```

During unlock:

- The target should be allowed.
- Unlock expires automatically.
- Unlock should survive browser restart until `expiresAt`.

Implementation options:

1. Remove or disable the matching DNR rule temporarily, then restore later.
2. Use higher-priority allow rules for unlocked targets.

Prefer the simpler implementation first, but keep the rule update deterministic.

## Basic Cooldown

Basic Cooldown is a free, non-AI delay.

Default:

- 5 minutes.

Behavior:

1. User clicks `Start Cooldown`.
2. Block page starts countdown.
3. Target remains blocked.
4. After countdown, user can:
   - Leave Site.
   - Start AI Check if unlocked and configured.
   - Start another cooldown.

It does not:

- Call LLM.
- Require license.
- Create AI Track.
- Update Pattern Memory.

## Delay Timer

Delay Timer is a state shown after:

- Basic Cooldown.
- AI decision `DELAY`.

For AI decision `DELAY`:

- User stays in the same AI Track.
- Countdown runs for `delaySeconds`.
- After countdown, user can continue chatting in the same track.
- No new track is created.

## BLOCK Until Next Day

When AI decision is `BLOCK`, BetterMe blocks the current target until local next day 00:00.

Example:

- User local time: 2026-05-10 21:15.
- Block expiry: 2026-05-11 00:00 local time.

Store:

```ts
interface BlockHold {
  id: string;
  targetId: string;
  sourceTrackId: string;
  createdAt: string;
  expiresAt: string;
  reason: "ai_block_until_next_day";
}
```

During block hold:

- AI Check should not allow a new AI Track for the same target.
- UI should show the block hold timer.
- User can still Leave Site.

## Leave Site / Close Tab

The primary escape should be free and obvious.

Preferred button label:

- If implementation closes the tab: `Close Tab`.
- If implementation navigates away: `Leave Site`.

Avoid label:

- `Close to Live`, because it is not natural English.

## Block Page Layout

MVP layout:

```text
----------------------------------------------------
| Left action area       | Right AI Check area       |
|                        |                           |
| target                 | opening message           |
| status                 | conversation              |
| Leave Site / Close Tab | input box                 |
| Start Cooldown         | turns/time remaining      |
| Settings               | decision result           |
----------------------------------------------------
```

In Free:

- Right AI Check area is visible but locked.
- Show why it is locked.
- Show Lifetime unlock entry.

In Lifetime BYOK:

- If key ready, show local opening message.
- If key unavailable, show provider setup prompt.

## Edge Cases

| Case | Expected behavior |
| --- | --- |
| User deletes blocked target while on block page | Show target no longer blocked and offer settings/home. |
| Unlock expires while page open | Timer ends; next navigation is blocked. |
| DNR rule update fails | Show local error and keep existing rules unchanged. |
| Exact URL includes query params | MVP exact match only; document behavior in UI. |
| User enters invalid domain | Reject with validation message. |
| User enters unsupported protocol | Support only `http` and `https` for MVP. |

