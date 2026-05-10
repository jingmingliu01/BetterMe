# Implementation Roadmap

This roadmap is ordered for hand-writing the project. Do not start with AI. First make blocking reliable.

## Phase 0: Project Setup

Goal: create a runnable Chrome extension skeleton.

Tasks:

- Create `apps/extension`.
- Set up Vite + React + TypeScript.
- Add `manifest.json`.
- Add background service worker entry.
- Add placeholder pages:
  - onboarding
  - block
  - settings
  - popup
- Load unpacked extension in Chrome.

Validation:

- Extension appears in `chrome://extensions`.
- Popup opens.
- Settings page opens.
- Background service worker logs a test message.

Docs:

- [Chrome Get Started](https://developer.chrome.com/docs/extensions/get-started)
- [Service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)

## Phase 1: Local Data Model

Goal: define and persist local state before building behavior.

Implement:

- `BlockedTarget`
- `UserSettings`
- `LicenseState`
- `TemporaryUnlock`
- `AITrack`
- `AITrackMessage`
- `AITrackSummary`
- `PatternMemory`

Storage:

- Simple settings in `chrome.storage.local`.
- Track/memory records in IndexedDB.

Validation:

- Add a setting.
- Reload extension.
- Confirm setting persists.

## Phase 2: Blocked Target Management

Goal: user can add/delete blocked domains and exact URLs.

Implement:

- `normalizeBlockedTarget(input, mode)`.
- Domain validation.
- Exact URL validation.
- Settings UI list.
- Popup "add current site" flow.
- Advanced collapsed exact URL button.

Validation:

- Add `youtube.com`.
- Add exact URL.
- Delete target.
- Confirm data persists after browser restart.

## Phase 3: DNR Redirect

Goal: visiting blocked targets redirects to block page.

Implement:

- Convert `BlockedTarget` to DNR rules.
- `updateDynamicRules`.
- Redirect main-frame requests to `block.html`.
- Pass `targetId` and original URL as query params.

Validation:

- Visiting blocked domain redirects.
- Visiting subdomain redirects.
- Visiting unrelated domain does not redirect.
- Exact URL redirects only when exact.

Docs:

- [chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

## Phase 4: Block Page UI

Goal: blocked page is usable without AI.

Implement:

- Target display.
- `Leave Site` or `Close Tab`.
- `Start Cooldown`.
- 5-minute Basic Cooldown timer.
- `Settings` shortcut.
- Right AI panel locked in Free.

Validation:

- Free user can leave.
- Free user can start cooldown.
- AI panel explains locked status.

## Phase 5: License Mock

Goal: unlock Lifetime BYOK locally for development.

Implement:

- Mock unlock button in dev settings.
- `LicenseState`.
- Feature gating.

Validation:

- Free state hides provider setup.
- Mock lifetime enables provider setup and AI panel.

## Phase 6: Local API Key Encryption

Goal: save provider API key without plaintext storage.

Implement:

- `crypto-key-store.ts`.
- Generate AES-GCM `CryptoKey` with `extractable: false`.
- Store CryptoKey in IndexedDB.
- Encrypt API key.
- Store ciphertext + IV.
- Decrypt only in background service worker.

Validation:

- Save key.
- Reload browser.
- Test decrypt still works.
- Inspect `chrome.storage.local`; plaintext key must not appear.

Docs:

- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## Phase 7: Provider Client

Goal: call OpenAI-compatible providers from background.

Implement:

- `ProviderConfig`.
- OpenAI-compatible `fetchChatCompletion`.
- Provider-specific base URLs.
- Error normalization.
- API key test request.

Providers:

- OpenAI.
- DeepSeek.
- Kimi.

Validation:

- Test valid key.
- Test invalid key.
- Test wrong model.
- Confirm UI shows provider-specific errors.

## Phase 8: AI Check Mock

Goal: build AI Track UI and state machine before real LLM decisions.

Implement:

- Local opening message.
- Chat UI.
- Track timeout.
- Turn counter.
- Mock decision buttons or mock response generator.
- ALLOW/DELAY/ASK_MORE/BLOCK enforcement.

Validation:

- ALLOW creates temporary unlock.
- DELAY starts timer and resumes same track.
- ASK_MORE adds question.
- BLOCK creates hold until local next day 00:00.

## Phase 9: Real AI Check

Goal: connect state machine to real provider.

Implement:

- Context builder.
- Gate Constitution.
- User Profile.
- Pattern Memory selection.
- Recent summaries.
- Current messages.
- Structured output schema.
- JSON parse + validation.
- One retry on invalid JSON.

Validation:

- Run real AI Check.
- Confirm JSON validates.
- Confirm decision applies.
- Confirm summary saved.
- Confirm Pattern Memory updates.

## Phase 10: Privacy and Data Controls

Goal: make local data transparent and removable.

Implement:

- Export local data.
- Delete API key.
- Delete AI history.
- Delete all BetterMe data.
- Privacy copy in settings.

Validation:

- Export excludes plaintext API key.
- Delete all clears DNR rules and local storage.

## Phase 11: NSFW Preset Placeholder

Goal: include category UX without exposing URL list.

Implement:

- Preset list UI.
- `NSFW` category disabled by default.
- Hidden concrete URL list.
- Count only, no site names in UI.

Validation:

- Enabling preset adds DNR rules.
- UI does not show adult URLs.
- User can disable preset.

## Phase 12: Packaging and Manual QA

Goal: create something installable for local dogfooding.

Manual tests:

- Install unpacked extension.
- Add domain.
- Visit domain.
- Leave Site.
- Cooldown.
- Mock unlock.
- Save provider key.
- Real AI Check.
- ALLOW unlock.
- DELAY timer.
- BLOCK until next day.
- Export/delete data.

Policy review:

- Minimal permissions.
- No remote code.
- No history permission.
- No page content reading.
- NSFW URLs hidden.
- Privacy copy present.

