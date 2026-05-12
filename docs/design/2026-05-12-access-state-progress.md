# 2026-05-12 Access State Progress

Related docs:

- Design: [2026-05-12-access-state-design.md](2026-05-12-access-state-design.md)
- Issues: [2026-05-12-access-state-issues.md](2026-05-12-access-state-issues.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

The current extension MVP exists and can run an end-to-end demo path:

- popup renders a lightweight entry.
- settings can add a blocked domain.
- Dev Unlock Lifetime exists.
- Demo Model can be enabled.
- DNR can redirect a blocked domain to `block.html`.
- AI Check can produce a structured demo decision.
- AI PM Review can create bad cases and eval cases.

Access-state foundation is now implemented and covered by true extension E2E. The remaining work is stronger `BlockHold` UX and AI `DELAY` continuation polish.

## Verified So Far

Last known E2E command:

```bash
npm --workspace apps/extension run test:e2e
```

Last known passing assertions:

- `POPUP_BOX width=360`
- `SETTINGS_OK true`
- `REDIRECT_URL chrome-extension://.../block.html?targetId=...`
- `COOLDOWN_UNLOCK_OK true`
- `UNLOCK_EXPIRY_OK true`
- `AI_CHECK_OK true`
- `REVIEW_OK true`

Additional latest assertions:

- Basic Cooldown initial countdown includes `5:00`.
- `UNLOCK_EXPIRY_OK true` now verifies active allowed tab redirects back to block page without manual refresh.

Last known build command:

```bash
npm --workspace apps/extension run build
```

Last known build status:

- Passed after implementing Basic Cooldown, access-state rendering, alarm-driven unlock expiry, AI ALLOW return flow, and updated Demo AI labeling.

## Implemented

- React + TypeScript MV3 extension scaffold.
- Background message router.
- Basic blocked target storage.
- Dynamic DNR rebuild.
- Temporary unlock model for AI/basic unlock source.
- AI Track demo flow.
- Local encrypted API key storage.
- AI PM bad case and eval case workflow.
- Popup lightweight entry for current domain.
- `BasicCooldown` type and storage helpers.
- `TargetAttempt` type and storage helpers.
- `AccessState` derivation helpers.
- `AIAvailability` derivation helpers.
- `chrome.alarms` access-state alarm wiring.
- Alarm scheduling after blocklist changes, cooldown creation, cooldown completion, AI decision enforcement, and data deletion.
- `webNavigation` attempt tracker that stores latest attempted URL by target without reading page content.
- Block page rendering based on `AccessState`.
- Block page AI readiness based on `AIAvailability`.
- Basic Cooldown countdown state.
- Completed Basic Cooldown continue flow.
- Temporary unlock creation after completed Basic Cooldown.
- Alarm-driven DNR restoration after short temporary unlock expiry.
- AI `ALLOW` now creates temporary unlock and returns to attempted/fallback URL.
- Settings button renamed from `Use Demo Model` to `Enable Demo AI`.
- Shared `ACCESS_TIMING` config for cooldown duration, post-cooldown browse duration, and unlock warning threshold.
- Popup resolves BetterMe block page `targetId` to the real blocked domain.
- Popup shows active temporary unlock remaining time.
- Popup `Blocked` count is now a separate collapsed card that expands into the blocked list.
- Popup no longer shows AI readiness badge or AI PM Review entry.
- Alarm expiry redirects open matching tabs back to BetterMe block page without requiring refresh.
- A content-script expiry guard also schedules redirect inside temporarily unlocked pages without reading page content.
- In-page unlock warning overlay appears at the configured warning threshold and requires user confirmation before continuing.
- Deleted target recovery is implemented for stale `block.html?targetId=...` pages.

## Not Yet Implemented

- Future refinement: add stronger UI around active `BlockHold` and AI `DELAY` continuation.

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

## Update Checklist

When this progress doc changes, check:

- Design doc: does the implementation status reveal a design gap?
- Issues doc: should a completed issue be closed or a new issue be added?
