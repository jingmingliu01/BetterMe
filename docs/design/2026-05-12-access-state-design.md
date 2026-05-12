# 2026-05-12 Access State Design

Related docs:

- Progress: [2026-05-12-access-state-progress.md](2026-05-12-access-state-progress.md)
- Issues: [2026-05-12-access-state-issues.md](2026-05-12-access-state-issues.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

BetterMe is not just a website blocker. It is a self-control checkpoint that appears when a user tries to visit a user-defined high-dopamine site.

The user should always have a free path to leave. The user may also use free Basic Cooldown. If Lifetime and AI provider configuration are ready, the user may start an AI Check. AI Check and Basic Cooldown must grant only temporary access. They must never mutate or weaken the permanent blocklist.

## Core Principle

Keep permanent intent separate from temporary access.

Permanent:

- `BlockedTarget`: the user wants this domain or exact URL controlled.

Temporary:

- `BasicCooldown`: the user is waiting before deciding.
- `TemporaryUnlock`: the user may access a target until `expiresAt`.
- `BlockHold`: the target is blocked until a fixed time, currently local next midnight.
- `AITrack`: one bounded AI checkpoint conversation.

Capability:

- `LicenseState`: whether AI features are unlocked.
- `ProviderKeyState`: whether the selected model can be called.

Do not use one of these states as a proxy for another.

## Derived State

Every blocked page should derive two independent states.

### AccessState

```ts
type AccessState =
  | "not_blocked"
  | "blocked"
  | "cooling_down"
  | "temporarily_unlocked"
  | "block_held_until_tomorrow";
```

Meaning:

- `not_blocked`: no matching enabled `BlockedTarget`.
- `blocked`: target matches and no active temporary exception exists.
- `cooling_down`: a `BasicCooldown` exists and has not reached `endsAt`.
- `temporarily_unlocked`: a `TemporaryUnlock` exists and has not reached `expiresAt`.
- `block_held_until_tomorrow`: a `BlockHold` exists and has not expired.

Precedence:

1. `not_blocked`
2. `block_held_until_tomorrow`
3. `temporarily_unlocked`
4. `cooling_down`
5. `blocked`

`BlockHold` wins over `TemporaryUnlock`. A user should not be able to bypass an AI `BLOCK` with a stale unlock.

### AIAvailability

```ts
type AIAvailability =
  | "locked_free"
  | "missing_provider_key"
  | "blocked_by_hold"
  | "ready";
```

Meaning:

- `locked_free`: Lifetime license is not unlocked.
- `missing_provider_key`: Lifetime is unlocked but no provider key or demo model is configured.
- `blocked_by_hold`: target has active block hold.
- `ready`: user can start AI Check.

`LicenseState` affects AI availability only. It must not add, remove, or disable block rules.

## DNR Rule Strategy

Declarative Net Request rules should be rebuilt from canonical local state.

Default:

- Every enabled `BlockedTarget` has a redirect rule.

Exception:

- If target has active `TemporaryUnlock`, omit that target's DNR rule until unlock expires.

No exception:

- `BasicCooldown` does not remove DNR rules.
- `LicenseState` does not remove DNR rules.
- Provider key state does not remove DNR rules.
- `BlockHold` keeps or restores DNR rules.

Rule rebuild triggers:

- Extension install.
- Extension startup.
- Blocked target add/delete/update.
- Temporary unlock created.
- Temporary unlock expired.
- Block hold created/expired.
- Basic cooldown completed if it creates a temporary unlock.

Use `chrome.alarms` for timed rebuilds.

## Redirect Context

The block page needs enough context to recover the user intent.

Preferred redirect URL:

```text
block.html?targetId=<id>&attemptUrl=<encoded-original-url>
```

`attemptUrl` is required for:

- returning after AI `ALLOW`,
- returning after Basic Cooldown unlock,
- showing the exact attempted page,
- producing better AI context without reading page content.

If dynamic attempt URL injection is limited by MV3 DNR, use a background/webNavigation helper or store latest attempted URL by tab before redirect. Do not read page content.

### Chosen MVP Strategy: Tab-Level Attempt Mapping

Use `targetId + tabId` as the lookup key for attempted URL recovery.

Why:

- `targetId` identifies the blocked rule, not one user navigation.
- One domain target can have many attempted URLs across multiple tabs.
- A target-level latest attempt can be overwritten by another tab before the first block page loads.
- `webNavigation.onBeforeNavigate` provides `tabId`, `frameId`, and `url`, so tab-level mapping is available without reading page content.

Flow:

```text
user navigates to blocked URL in tab 123
  -> webNavigation.onBeforeNavigate(frameId = 0) captures URL
  -> find matching BlockedTarget
  -> store TargetAttempt(targetId, tabId = 123, attemptUrl, createdAt)
  -> DNR redirects the same tab to block.html?targetId=<id>
  -> BlockPage calls chrome.tabs.getCurrent()
  -> BlockPage looks up attempt by targetId + current tabId
  -> fallback to target-level latest attempt only if tab-level lookup misses
  -> fallback to target homepage only if no attempt exists
```

Rules:

- Only store main-frame attempts where `frameId === 0`.
- Do not read page content.
- Keep attempts bounded and prune old records.
- Preserve recent attempts briefly after target deletion so stale block pages can recover to the attempted URL.
- Prefer tab-level attempt over target-level latest attempt.

Not chosen for MVP:

- DNR `regexSubstitution` that injects the attempted URL directly into `block.html`.

Reason:

- It is more exact in theory, but DNR does not automatically URL-encode the original URL as a query parameter.
- Raw URLs contain `?`, `&`, `=`, and `#`, which makes parsing fragile.
- The regex rules are harder to generate and debug for domain and exact-URL targets.
- Tab-level mapping gives most of the accuracy with lower implementation risk.

## Basic Cooldown Flow

Basic Cooldown is free and does not consume AI Check.

Timing values are centralized in shared configuration:

- `basicCooldownSeconds`: default `5 * 60`.
- `basicCooldownUnlockSeconds`: default `5 * 60`.
- `unlockWarningRemainingSeconds`: default `60`.

UI labels, countdowns, unlock creation, alarms, and in-page warnings should use these values rather than hard-coded durations.

Flow:

```text
blocked page
  -> user clicks Basic Cooldown
  -> create BasicCooldown(targetId, attemptUrl, endsAt = now + 5m)
  -> page shows countdown
  -> DNR remains active
  -> countdown complete
  -> user clicks Continue for 5m
  -> create TemporaryUnlock(source = "basic_cooldown", expiresAt = now + 5m)
  -> rebuild DNR
  -> navigate to attemptUrl
```

Important:

- Clicking Basic Cooldown alone should not unlock the site.
- The user must wait.
- After waiting, the user gets a short temporary unlock.
- When unlock expires, DNR must be restored automatically.

## Active Page Expiry Guard

Temporary access expiry uses two enforcement layers.

Layer 1:

- Background `chrome.alarms` rebuilds DNR rules.
- The alarm handler also scans open http/https tabs and redirects matching expired targets to the block page.

Layer 2:

- A privacy-minimal content script runs on http/https pages.
- It does not read page content.
- It sends only `window.location.href` to the extension background.
- Background returns whether the URL matches a blocked target, whether it has an active unlock, and the unlock expiry timestamp.
- If the page has an active unlock, the content script schedules a local redirect at `expiresAt`.
- If the page matches a blocked target and has no active unlock, the content script redirects immediately.

Reason:

- DNR is reliable for new navigation.
- A tab already visible during a temporary unlock may need an in-page redirect when the unlock expires.
- `chrome.alarms` can be delayed by browser scheduling, so the content script makes the visible tab behavior deterministic without reading page content.

## In-Page Unlock Warning

The 1-minute warning is an in-page BetterMe overlay, not an OS/browser notification.

Flow:

```text
temporary unlock page
  -> content script asks background for PageAccessInfo
  -> background returns target id, target display, unlock id, expiresAt, warning threshold
  -> content script schedules warning at expiresAt - warningThreshold
  -> warning overlay blocks page interaction
  -> user clicks OK to continue deliberately
  -> final expiry redirect still runs even if the user does not click OK
```

Implementation rules:

- Use a content script.
- Use Shadow DOM for the overlay so page CSS does not break it.
- Do not read page content.
- Send only current URL to background for matching.
- Keep the final expiry redirect independent from the warning acknowledgement.
- Avoid runtime imports in the content script bundle because manifest content scripts are loaded as classic scripts.

This replaces the earlier system-notification idea for the core product experience.

## Deleted Target Recovery

Deleting a blocked target should synchronize all visible state.

When a `BlockedTarget` is deleted:

- Remove the permanent target.
- Remove access states tied to that target:
  - temporary unlocks,
  - cooldowns,
  - block holds.
- Rebuild DNR rules.
- Reschedule access-state alarms.
- Preserve recent target attempts long enough for an already-open block page to recover to the attempted URL.

If an existing `block.html?targetId=<deleted-id>` page is refreshed or receives storage updates:

- It must not fall back to a different blocked target.
- It should show `No longer blocked` or automatically return to the attempted URL when known.
- It should never keep the old checkpoint active for a deleted target.

## Popup Information Architecture

The browser-action popup is a lightweight control surface, not the full blocked-page experience.

It should show:

- Current active page domain.
- Primary action to block the current domain when supported.
- Reload action.
- Separate collapsed `Blocked` card with blocked list details.
- Settings entry.
- Active temporary unlock remaining time for the current target when applicable.

It should not show:

- AI readiness badge.
- AI PM Review entry.
- Full AI Check UI.

Blocked list behavior:

- `Blocked` is a separate card.
- Default state is collapsed.
- Expanded state lists blocked targets and target type.
- The card must not replace or confuse the current active page domain.

## AI Check Flow

AI Check is available only when `AIAvailability === "ready"`.

Flow:

```text
blocked page
  -> local opening message appears
  -> user starts AI Track
  -> user sends reason
  -> LLM returns structured decision
  -> extension validates decision
  -> extension applies local enforcement
```

Decision effects:

- `ALLOW`: create `TemporaryUnlock`, rebuild DNR, navigate to `attemptUrl`.
- `DELAY`: keep blocked, show timer, allow same track to continue after delay.
- `ASK_MORE`: keep blocked, add assistant question, continue same track.
- `BLOCK`: create `BlockHold` until local next midnight, rebuild DNR, complete track.

## Dev Unlock Semantics

`Dev Unlock Lifetime` means:

- `LicenseState.status = "lifetime_mock"`
- AI UI can be unlocked if provider config is also ready.

It does not mean:

- blocklist is disabled,
- DNR rules are removed,
- AI provider key exists.

For demos, provide a separate explicit action:

```text
Enable Demo AI
```

This can store `demo-local-model` as the selected provider key so `AIAvailability` becomes `ready`.

## Implementation Modules

Suggested files:

- `src/blocking/access-state.ts`
  - `deriveAccessState(input)`
  - `deriveAIAvailability(input)`
  - `getActiveUnlockForTarget(targetId)`
  - `getActiveCooldownForTarget(targetId)`
  - `getActiveHoldForTarget(targetId)`

- `src/blocking/cooldowns.ts`
  - `createBasicCooldown(input)`
  - `isCooldownActive(cooldown, now)`
  - `isCooldownComplete(cooldown, now)`
  - `createUnlockFromCompletedCooldown(cooldown, now)`

- `src/background/alarms.ts`
  - `scheduleAccessStateAlarm(id, when)`
  - `handleAccessStateAlarm()`

- `src/background/dnr-rules.ts`
  - rebuild from blocked targets + active temporary unlocks only.

- `src/pages/block/BlockPage.tsx`
  - render from `AccessState` and `AIAvailability`.

## Validation Plan

E2E tests should cover:

- popup can add current domain.
- blocked domain redirects to block page.
- Dev Unlock alone does not disable blocking.
- Demo AI enabled makes AI ready after page refresh.
- Basic Cooldown starts timer but does not unlock immediately.
- Completed Basic Cooldown creates temporary unlock.
- Temporary unlock allows original URL.
- Unlock expiry restores DNR blocking.
- AI `ALLOW` creates temporary unlock.
- AI `BLOCK` creates hold until next local midnight.
