# 2026-05-12 Access State Issues

Related docs:

- Design: [2026-05-12-access-state-design.md](2026-05-12-access-state-design.md)
- Progress: [2026-05-12-access-state-progress.md](2026-05-12-access-state-progress.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Open Issues

No open access-state issues at this checkpoint.

## Closed Issues

### ISSUE-016: Removing a blocked target should preserve behavior history

Status: closed

Current behavior:

- Settings removed a blocked target with a single click.
- Removing a target also cleared access state tied to that target.
- Add/remove/re-add cycles were not preserved as durable local history.
- Cooldown, attempt, unlock, and AI decision data lived mostly in runtime state that can be overwritten, filtered, or expired.

Expected behavior:

- Removing a blocked target should require deliberate confirmation friction.
- The confirmation flow should wait 10 seconds and require the exact typed phrase `I choose to remove this block`.
- Removing the target should stop active enforcement but keep local behavior history.
- Re-adding the same target should be connected through a stable identity.
- Future AI features should be able to summarize remove/re-add cycles, blocked attempts, cooldown starts, cooldown continues, cooldown abandons, strictness changes, and AI decisions.

Resolution:

- Added stable `targetKey` identity for blocked targets.
- Added IndexedDB `behaviorEvents` store as append-only local behavior history.
- Added behavior event logging for blocklist add/remove/re-add, removal prompt open/cancel, blocked URL attempts, Basic Cooldown start/continue/claim expiry, temporary unlock creation/expiry, AI Check session starts, AI decisions, block holds, and strictness changes.
- Settings removal now uses a 10-second delay plus typed confirmation phrase.
- Durable attempted URL events store a privacy-minimal URL shape instead of page content.
- E2E was updated to verify removal history and re-add history.

Design reference:

- [Durable Behavior History](2026-05-12-access-state-design.md#durable-behavior-history)

### ISSUE-015: Completed Basic Cooldown should not grant stale future access

Status: closed

Current behavior:

- A `BasicCooldown` with `endsAt <= now` and no `completedAt` is treated as complete indefinitely.
- If the user finishes a cooldown, leaves, and returns days later, the block page can still expose Continue without requiring a new cooldown.
- Basic Cooldown timing does not yet adapt to strictness or repeated attempts.

Expected behavior:

- Cooldown completion should be a short-lived claim state.
- Each cooldown should store `claimExpiresAt`.
- If `claimExpiresAt` passes before Continue, the cooldown should expire and no longer expose temporary access.
- Basic Cooldown should use strictness-based timing policies.
- Repeated cooldown starts for the same target should temporarily escalate to stricter timing within a 1-hour recent-use window without changing saved user settings.
- Settings should explain what each strictness preset changes.

Resolution:

- Added strictness-based Basic Cooldown policies for `gentle`, `balanced`, `strict`, and `monk`.
- `balanced` remains the default 5m cooldown plus 5m unlock.
- `BasicCooldown` now stores `claimExpiresAt`, `strictness`, and `attemptCount` for new cooldowns.
- `isCooldownComplete` now requires the completion claim window to still be open.
- Added per-target `CooldownEscalation` storage using a 1-hour recent-use window.
- Block page now renders Continue duration from the actual completed cooldown and shows remaining claim time.
- Settings now describes the selected strictness preset, all preset timings, the AI `ALLOW` cap, and repeat escalation.

Design reference:

- [Basic Cooldown Flow](2026-05-12-access-state-design.md#basic-cooldown-flow)

### ISSUE-014: Attempted URL should be recovered by targetId + tabId

Status: closed

Current behavior:

- Attempted URL recovery is target-level latest attempt.
- Multiple tabs hitting the same blocked target can overwrite each other.
- A block page may recover to another tab's latest attempted URL.

Expected behavior:

- `webNavigation.onBeforeNavigate` should store main-frame attempts with `targetId`, `tabId`, `attemptUrl`, and `createdAt`.
- Block page should call `chrome.tabs.getCurrent()` and prefer lookup by `targetId + currentTabId`.
- Target-level latest attempt should remain only as fallback.
- Domain homepage fallback should remain the final fallback.

Resolution:

- Target attempts are now saved per `targetId + tabId`.
- Block page reads current extension tab id through `chrome.tabs.getCurrent()`.
- Attempt lookup order is:
  1. explicit `attemptUrl` query param,
  2. `targetId + currentTabId`,
  3. target-level latest attempt,
  4. target homepage fallback.
- E2E assertion: `TAB_ATTEMPT_MAPPING_OK true`.

Design reference:

- [Chosen MVP Strategy: Tab-Level Attempt Mapping](2026-05-12-access-state-design.md#chosen-mvp-strategy-tab-level-attempt-mapping)

### ISSUE-009: User should receive in-page reminder before temporary unlock expires

Status: closed

Current behavior:

- System notification was wired but did not match the desired product behavior.
- The desired behavior is an in-page modal overlay inside the currently browsed site.

Expected behavior:

- When remaining time reaches configured warning threshold, currently 1 minute, BetterMe should show an in-page overlay.
- The overlay should block page interaction until the user confirms.
- Final expiry redirect must still happen even if the user does not confirm.

Resolution:

- Added in-page warning overlay to the content-script expiry guard.
- Overlay uses Shadow DOM to avoid page CSS collisions.
- Content script sends only current URL to background and does not read page content.
- Removed legacy system notification helper and `notifications` permission after confirming in-page warning is the product direction.
- E2E assertion: `IN_PAGE_WARNING_OK true`.

### ISSUE-013: Deleted blocked target should release stale block pages

Status: closed

Current behavior:

- If the user deletes a blocked target, an already-open `block.html?targetId=...` page can remain stuck on the old checkpoint after refresh.

Expected behavior:

- Deleting a target should remove its active access states.
- Existing block pages for that target should recognize the target no longer exists.
- If an attempted URL is known, the page should return to it.

Resolution:

- Delete now clears unlock/cooldown/hold state for that target.
- Block page no longer falls back to the first blocked target when an explicit `targetId` is missing.
- Block page listens for local storage changes and refreshes its derived state.
- Stale block pages auto-return to the stored attempted URL when available.
- E2E assertion: `DELETED_TARGET_RECOVERY_OK true`.

### ISSUE-006: Popup cannot resolve current domain on BetterMe block page

Status: closed

Current behavior:

- When the active tab is `chrome-extension://.../block.html?targetId=...`, popup shows `Unsupported page`.
- On normal http/https tabs, popup must keep showing the actual active tab hostname, not a blocked-list target.

Expected behavior:

- Popup should recognize BetterMe block page.
- It should resolve `targetId` back to the blocked target and show the real target domain, for example `www.youtube.com`.
- It should not ask the user to block the extension page itself.
- On a normal page such as Google search, Current domain should show `www.google.com` while the blocked list remains separate.

Resolution:

- Popup detects `chrome-extension://.../block.html?targetId=...`.
- It resolves `targetId` from local blocked targets and displays the target domain.
- The target is treated as already blocked rather than unsupported.
- Popup now keeps current active page domain and blocked-list display as separate UI concepts.

### ISSUE-007: Basic Cooldown timing should use centralized configurable values

Status: closed

Current behavior:

- Cooldown duration and post-cooldown unlock duration are tied to scattered constants.

Expected behavior:

- Cooldown duration, post-cooldown unlock duration, completed-cooldown claim window, and unlock warning threshold should live in shared timing config.
- UI labels and timers should use that config.

Resolution:

- Added shared `ACCESS_TIMING` config.
- Basic Cooldown duration, post-cooldown unlock duration, completed-cooldown claim window, and warning threshold now come from shared config/policy.
- E2E verifies initial cooldown display includes `5:00`.

### ISSUE-008: Popup should show remaining temporary unlock time

Status: closed

Current behavior:

- After `Continue for 5m`, popup does not show remaining browse time for the current target.

Expected behavior:

- Popup should detect active `TemporaryUnlock` for the current target and show remaining time.

Resolution:

- Popup reads active unlocks and displays browse time remaining for the current target.
- Works for normal http/https pages and BetterMe block pages with `targetId`.

### ISSUE-010: Active allowed tab should redirect back to block page when browse time ends

Status: closed

Current behavior:

- DNR restores after unlock expiry, but an already-loaded allowed page may remain visible until refresh/navigation.

Expected behavior:

- When a temporary unlock expires, open tabs matching that target should be redirected to BetterMe block page without requiring manual refresh where extension APIs allow it.

Resolution:

- Alarm handler now finds expired unlock targets.
- Matching open http/https tabs are updated to the BetterMe block page.
- Added a privacy-minimal content-script expiry guard on http/https pages.
- The guard sends only the current URL to background, receives unlock expiry metadata, and schedules a local redirect at `expiresAt`.
- E2E verifies the active allowed tab redirects back without a manual refresh.

### ISSUE-011: Popup blocked count should be a collapsible card

Status: closed

Current behavior:

- The blocked count is shown inline beside AI readiness.
- The user cannot expand it to see blocked targets from the popup.

Expected behavior:

- `Blocked` should be its own card.
- It should be collapsed by default.
- Expanding it should show the blocked list.

Resolution:

- Added a separate collapsed `Blocked` card.
- Expanded state lists target display and whether each target is a domain or exact URL.

### ISSUE-012: Popup should remove AI-ready badge and AI PM Review button

Status: closed

Current behavior:

- Popup shows AI readiness badge.
- Popup includes `AI PM Review`.

Expected behavior:

- Popup should stay focused on adding/reloading/settings.
- AI readiness belongs on the block page and settings page.
- AI PM review is not part of the browser-action popup.

Resolution:

- Removed AI readiness badge from popup.
- Removed AI PM Review button from popup.

### ISSUE-001: Basic Cooldown is not implemented as a real timer flow

Status: closed

Current behavior:

- The code has `blocking/startCooldown`.
- It currently creates a `TemporaryUnlock` immediately.

Expected behavior:

- Start Basic Cooldown should create `BasicCooldown`.
- The user waits 5 minutes.
- Only after completion should the user be able to create a short `TemporaryUnlock`.

Resolution:

- Added `BasicCooldown` model and storage.
- Start Basic Cooldown now creates cooldown state instead of immediate unlock.
- Block page shows countdown while the site remains blocked.
- Completed cooldown exposes `Continue for 5m`, creates `TemporaryUnlock`, rebuilds DNR, and navigates to attempted/fallback URL.
- E2E assertion: `COOLDOWN_UNLOCK_OK true`.

Design reference:

- [Basic Cooldown Flow](2026-05-12-access-state-design.md#basic-cooldown-flow)

### ISSUE-002: Temporary unlock expiry does not reliably restore DNR

Status: closed

Current risk:

- DNR rules are rebuilt when unlock is created.
- There is no timed alarm that guarantees DNR rebuild after `expiresAt`.

Expected behavior:

- On unlock creation, schedule `chrome.alarms`.
- On alarm, prune expired unlocks and rebuild DNR rules.
- Blocking should resume without requiring manual reload or settings changes.

Current update:

- `chrome.alarms` access-state wiring has been added.
- Alarm scheduling is triggered after state-changing background operations.
- Expiry-specific E2E proves DNR is restored after `TemporaryUnlock.expiresAt`.
- E2E assertion: `UNLOCK_EXPIRY_OK true`.

Design reference:

- [DNR Rule Strategy](2026-05-12-access-state-design.md#dnr-rule-strategy)

### ISSUE-003: Legacy license/demo controls confuse AI readiness

Status: closed

Current behavior:

- Older settings UI exposed `Dev Unlock Lifetime`.
- Older settings UI exposed demo AI setup.
- Block page could require both license and provider key, which made AI readiness look like a paid gate.

Expected behavior:

- Remove lifetime unlock and demo AI from current product flow.
- AI Check should become ready after a real provider key is saved, subject to access state.
- Provider readiness should stay separate from temporary unlock, cooldown, and hold state.

Resolution:

- Settings no longer shows Lifetime, Dev Unlock, Demo AI, or AI PM mode controls.
- Settings no longer shows an AI Check status badge or paywall framing.
- Background routes no longer accept license unlock/reset messages.
- Demo provider execution was removed.
- Block page derives AI readiness through `AIReadiness`, not local ad hoc license checks.

Design reference:

- [Provider Key Semantics](2026-05-12-access-state-design.md#provider-key-semantics)

### ISSUE-004: Redirect does not preserve original attempted URL

Status: closed

Current behavior:

- DNR redirect passes `targetId`.
- It does not preserve `attemptUrl`.

Expected behavior:

- Block page should know the original attempted URL.
- `ALLOW` and completed Basic Cooldown should return the user to that URL.

Current update:

- `webNavigation.onBeforeNavigate` now stores latest attempted URL by target.
- Block page consumes stored attempted URL where available.
- Block page uses a safe target-based fallback when the stored attempt is unavailable.
- Basic Cooldown completion and AI `ALLOW` navigate back to attempted/fallback URL.

Design reference:

- [Redirect Context](2026-05-12-access-state-design.md#redirect-context)

### ISSUE-005: Block page logic is based on scattered UI conditionals

Status: closed

Current behavior:

- Block page computes AI readiness directly in React.
- Cooldown/hold/unlock state is not centrally derived.

Expected behavior:

- Block page receives or derives `AccessState` and `AIReadiness`.
- UI branches should map directly from those states.

Resolution:

- Added `deriveAccessState`.
- Added `deriveAIReadiness`.
- Block page now renders access badge, cooldown UI, and AI readiness from those derived states.

Design reference:

- [Derived State](2026-05-12-access-state-design.md#derived-state)

## Triage Rule

Do not fix these issues one by one with local UI patches. Implement `Access State Foundation` from the progress doc first, then close issues as the unified model resolves them.
