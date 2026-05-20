# 2026-05-12 Access State Progress

Related docs:

- Design: [2026-05-12-access-state-design.md](2026-05-12-access-state-design.md)
- Issues: [2026-05-12-access-state-issues.md](2026-05-12-access-state-issues.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

The current extension MVP exists and can run an end-to-end local extension path:

- popup renders a lightweight entry.
- settings can add a blocked domain.
- settings can save a local provider key.
- DNR can redirect a blocked domain to `block.html`.
- AI Check UI becomes ready when a provider key is saved.

Access-state foundation is now implemented and covered by true extension E2E. The remaining work is stronger `BlockHold` UX and AI cooldown continuation polish.

Current priority rule: AI-created `BlockHold` must outrank Basic Cooldown. While a hold is active, Basic Cooldown start/continue controls and background unlock creation should be unavailable.

2026-05-18 update:

- Implemented AI hold priority over Basic Cooldown in both Block page UI and background handlers.
- Access-state issues doc was updated to close ISSUE-018 after E2E coverage.

## Verified So Far

Last known E2E command:

```bash
npm --workspace apps/extension run test:e2e
```

Last known passing assertions:

- `POPUP_BOX width=360`
- `SETTINGS_OK true`
- `REDIRECT_URL chrome-extension://.../block.html?targetId=...`
- `PROVIDER_KEY_LIVE_REFRESH_OK true`
- `COOLDOWN_UNLOCK_OK true`
- `UNLOCK_EXPIRY_OK true`
- `AI_READY_UI_OK true`

Additional latest assertions:

- Basic Cooldown initial countdown includes `5:00`.
- `UNLOCK_EXPIRY_OK true` now verifies active allowed tab redirects back to block page without manual refresh.

Last known build command:

```bash
npm --workspace apps/extension run build
```

Last known build status:

- Passed after implementing Basic Cooldown, access-state rendering, alarm-driven unlock expiry, provider-key AI readiness, and removing license/demo/AIPM surfaces.

## Implemented

- React + TypeScript MV3 extension scaffold.
- Background message router.
- Basic blocked target storage.
- Dynamic DNR rebuild.
- Temporary unlock model for AI/basic unlock source.
- Local encrypted API key storage.
- Popup lightweight entry for current domain.
- `BasicCooldown` type and storage helpers.
- `TargetAttempt` type and storage helpers.
- `AccessState` derivation helpers.
- `AIReadiness` derivation helpers.
- `chrome.alarms` access-state alarm wiring.
- Alarm scheduling after blocklist changes, cooldown creation, cooldown completion, AI decision enforcement, and data deletion.
- `webNavigation` attempt tracker that stores latest attempted URL by target without reading page content.
- Block page rendering based on `AccessState`.
- Block page AI readiness based on `AIReadiness`.
- Block page live-refreshes AI readiness when settings or provider-key revision changes.
- Basic Cooldown countdown state.
- Completed Basic Cooldown continue flow.
- Temporary unlock creation after completed Basic Cooldown.
- Alarm-driven DNR restoration after short temporary unlock expiry.
- AI `ALLOW` now creates temporary unlock and returns to attempted/fallback URL.
- Settings no longer exposes Lifetime, Demo AI, or AI PM mode controls.
- Settings no longer shows an AI Check status badge or other paywall framing.
- Provider key save/delete publishes a non-sensitive revision signal for already-open extension pages.
- Shared `ACCESS_TIMING` config for cooldown duration, post-cooldown browse duration, and unlock warning threshold.
- Strictness-based Basic Cooldown policies: gentle, balanced default, strict, and monk.
- Completed cooldown claim windows so old completed cooldowns cannot be used days later.
- Per-target cooldown escalation so repeated Basic Cooldown starts within 1 hour temporarily use stricter timing.
- Settings explains strictness presets, timing differences, AI `ALLOW` caps, and repeat escalation.
- Popup resolves BetterMe block page `targetId` to the real blocked domain.
- Popup shows active temporary unlock remaining time.
- Popup `Blocked` count is now a separate collapsed card that expands into the blocked list.
- Popup no longer shows AI readiness badge or AI PM Review entry.
- Alarm expiry redirects open matching tabs back to BetterMe block page without requiring refresh.
- A content-script expiry guard also schedules redirect inside temporarily unlocked pages without reading page content.
- In-page unlock warning overlay appears at the configured warning threshold and requires user confirmation before continuing.
- Deleted target recovery is implemented for stale `block.html?targetId=...` pages.
- Blocked targets now have stable `targetKey` identity for future remove/re-add analysis.
- Added append-only `BehaviorEvent` history in IndexedDB.
- Behavior history records add, remove, re-add, blocked attempts, cooldown starts/continues/claim expiry, temporary unlock creation/expiry, AI Check session starts, AI decisions, AI cooldown lifecycle, final-turn arrival, block holds, and strictness changes.
- Settings removal now uses a 10-second confirmation delay plus exact typed confirmation phrase.

## Not Yet Implemented

- Future refinement: add local behavior summaries for AI prompt context.
- Future refinement: add stronger UI around active `BlockHold` and AI cooldown continuation.

## Recommended Next Milestone

Milestone name:

```text
Access State Foundation
```

Status: complete.

Scope:

1. Add `BasicCooldown` types and storage. Status: done.
2. Add access-state derivation functions. Status: done.
3. Refactor DNR rebuild around active `TemporaryUnlock`. Status: done and tested.
4. Add alarms for timed state transitions. Status: done and expiry-tested.
5. Update Block page to render cooldown and AI availability from derived state. Status: done and tested.
6. Expand E2E tests for cooldown and DNR recovery. Status: done.

## Synchronization Note

2026-05-12:

- Design doc checked: no design change needed; implementation follows the current design.
- Issues doc checked: no issue can be closed yet because cooldown UI, alarms, and block page integration are still pending.

2026-05-12:

- Design doc checked after adding alarms and attempt tracker: no design change needed.
- Issues doc updated: ISSUE-002 and ISSUE-004 are now partially complete, but remain open pending expiry E2E and unlock return flow.

2026-05-12:

- Design doc checked after Basic Cooldown and expiry E2E: no design change needed.
- Issues doc updated: ISSUE-001 through ISSUE-005 moved to closed with implementation evidence.

2026-05-12:

- Design doc updated with centralized timing config.
- Issues doc updated: ISSUE-006, ISSUE-007, ISSUE-008, and ISSUE-010 closed; ISSUE-009 partially complete pending manual notification visibility check.

2026-05-12:

- Design doc updated with popup information architecture and active page expiry guard.
- Issues doc updated: popup UI issues closed; ISSUE-010 resolution now includes content-script guard in addition to alarm redirect.
- Latest E2E still passes after popup and content-script changes:
  - `COOLDOWN_UNLOCK_OK true`
  - `UNLOCK_EXPIRY_OK true`
  - `AI_CHECK_OK true`
  - `REVIEW_OK true`

2026-05-12:

- Design doc updated with in-page unlock warning and deleted target recovery.
- Issues doc updated: ISSUE-009 closed as in-page warning; ISSUE-013 closed for deleted target recovery.
- Latest E2E passes with additional assertions:
  - `IN_PAGE_WARNING_OK true`
  - `DELETED_TARGET_RECOVERY_OK true`

2026-05-12:

- Removed legacy system-notification path after user confirmation.
- Removed `notifications` manifest permission.
- Removed background notification helper and warning-threshold alarm branch.
- Design doc checked: in-page warning remains the intended product behavior.
- Issues doc checked: no new open issue needed.
- Latest E2E still passes:
  - `IN_PAGE_WARNING_OK true`
  - `UNLOCK_EXPIRY_OK true`
  - `DELETED_TARGET_RECOVERY_OK true`

2026-05-18:

- Added strictness-based Basic Cooldown timing policies.
- Default `balanced` policy remains 5m cooldown plus 5m temporary access.
- Added a short completed-cooldown claim window; completed cooldowns expire if the user does not click Continue in time.
- Added per-target 1-hour recent cooldown escalation, capped at `monk`, without changing saved strictness.
- Added Settings descriptions for strictness presets, including cooldown/access/claim timings and AI access caps.
- Updated extension E2E selectors for current `Block This Domain` UI copy.
- Design and issues docs updated because cooldown timing semantics and stale-completion risk changed.
- Latest E2E passes:
  - `COOLDOWN_UNLOCK_OK true`
  - `IN_PAGE_WARNING_OK true`
  - `UNLOCK_EXPIRY_OK true`
  - `DELETED_TARGET_RECOVERY_OK true`

2026-05-12:

- Design doc updated to choose tab-level attempted URL mapping.
- Issues doc updated with ISSUE-014 as the next open implementation issue.
- No code change in this step.

2026-05-12:

- Implemented tab-level attempted URL mapping.
- Block page now uses `targetId + currentTabId` before falling back to target-level latest attempt.
- Target attempts are now retained per tab instead of overwritten per target.
- Issues doc updated: ISSUE-014 closed.
- Latest E2E includes:
  - `TAB_ATTEMPT_MAPPING_OK true`

2026-05-17:

- Added `providerKeyRevision` as a non-sensitive storage invalidation signal for provider key save/delete.
- Block page now watches `settings` and `providerKeyRevision`, then refreshes bootstrap state from background.
- Latest E2E includes:
  - `PROVIDER_KEY_LIVE_REFRESH_OK true`

2026-05-18:

- Design doc updated with durable behavior history and stable `targetKey` semantics.
- Issues doc updated with ISSUE-016 for removal friction and local behavior history.
- Added IndexedDB `behaviorEvents` store.
- Added behavior event logging for blocklist add/remove/re-add, blocked URL attempts, Basic Cooldown start/continue/claim expiry, temporary unlock creation/expiry, AI Check session starts, AI decisions, AI cooldown lifecycle, final-turn arrival, block holds, and strictness changes.
- Settings removal now requires a 10-second delay and typing `I choose to remove this block`.
- E2E updated to verify removal history and re-add history.
- Validation status:
  - `npm --workspace apps/extension run typecheck` passed.

2026-05-18:

- Active AI holds now suppress both Basic Cooldown and new AI Check negotiation.
- Held block pages can show the latest blocked AI session read-only instead of starting a new conversation.
- Issues doc did not need a new access-state issue because ISSUE-018 already covers hold priority and remains closed.
- Latest validation:
  - `npm --workspace apps/extension run test:e2e`

## Update Checklist

When this progress doc changes, check:

- Design doc: does the implementation status reveal a design gap?
- Issues doc: should a completed issue be closed or a new issue be added?
