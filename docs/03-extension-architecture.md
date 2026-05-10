# Extension Architecture

## Architecture Summary

BetterMe MVP is a Chrome-only Manifest V3 extension.

There is no BetterMe cloud backend in the MVP AI path. The local extension background service worker acts as the internal coordinator.

```text
Chrome Browser
  BetterMe Extension
    manifest.json
    background service worker
    React extension pages
    chrome.storage.local
    IndexedDB
    declarativeNetRequest rules
        |
        | HTTPS fetch with user's API key
        v
    OpenAI / DeepSeek / Kimi
```

## What "Extension Backend" Means

The extension backend is not a server you own.

It is:

- `background/service_worker.ts`
- Runs in the user's browser.
- Has no DOM.
- Handles browser events and extension messages.
- Reads/writes extension storage.
- Updates DNR rules.
- Decrypts the user's provider API key.
- Calls the selected LLM provider.
- Validates structured AI decisions.

It cannot:

- Hide code from the user.
- Protect commercial secrets like prompts.
- Reliably enforce license against a determined local attacker.
- Store your own shared provider API key safely.

Official docs: [Extension service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)

## Proposed File Structure

```text
betterme/
  README.md
  docs/
  apps/
    extension/
      manifest.json
      package.json
      src/
        background/
          service-worker.ts
          dnr-rules.ts
          llm-runner.ts
          message-router.ts
        pages/
          onboarding/
          block/
          settings/
          popup/
        storage/
          local-store.ts
          indexed-db.ts
          crypto-key-store.ts
        ai/
          checkpoint-schema.ts
          context-builder.ts
          prompt.ts
          provider-client.ts
        blocking/
          target-parser.ts
          match-rules.ts
          unlocks.ts
          timers.ts
        license/
          license-store.ts
          mock-license.ts
        shared/
          types.ts
          constants.ts
```

## Runtime Components

### Manifest

`manifest.json` declares:

- `manifest_version: 3`
- background service worker
- permissions
- host permissions for LLM provider endpoints
- extension pages
- DNR permission

Reference:

- [Manifest](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

### Background Service Worker

Responsibilities:

- Own all privileged operations.
- Receive messages from UI pages.
- Update DNR rules when blocked targets change.
- Start or continue AI Track.
- Decrypt API key.
- Call provider endpoint.
- Validate model output.
- Save track summaries and pattern memory.

Do not put LLM calls in React page components. UI pages should send messages to the service worker.

Reference:

- [chrome.runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime)
- [Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)

### React Pages

Pages:

- `onboarding.html`
- `block.html`
- `settings.html`
- `popup.html`

These are normal web pages bundled inside the extension. They can use React, TypeScript, CSS, and normal browser APIs.

They should not:

- Directly access plaintext API keys.
- Directly call LLM providers.
- Read web page content.

They should:

- Render UI.
- Send typed messages to the background service worker.
- Display current app state.

### DNR Rules

Use `chrome.declarativeNetRequest` dynamic rules for user-defined blocked targets.

Why DNR:

- More privacy-friendly than intercepting request bodies.
- Lets browser perform matching.
- Good fit for redirect/block.
- Aligns with Manifest V3.

Reference: [chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

### Storage

Use:

- `chrome.storage.local` for simple persisted settings.
- IndexedDB for structured local records and CryptoKey storage.
- Avoid `chrome.storage.sync` for API keys or sensitive state.

Reference: [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## Message Passing Contract

UI pages should talk to background through typed messages.

Example message types:

```ts
type ExtensionMessage =
  | { type: "blockedSites/add"; payload: AddBlockedSiteInput }
  | { type: "blockedSites/list" }
  | { type: "blockedSites/delete"; payload: { id: string } }
  | { type: "license/getStatus" }
  | { type: "license/mockUnlock" }
  | { type: "provider/saveApiKey"; payload: SaveApiKeyInput }
  | { type: "provider/test" }
  | { type: "aiTrack/start"; payload: StartTrackInput }
  | { type: "aiTrack/sendMessage"; payload: SendTrackMessageInput }
  | { type: "aiTrack/getState"; payload: { trackId: string } };
```

All handlers should return:

```ts
type ExtensionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExtensionError };
```

## Permission Strategy

MVP permissions should be minimal:

- `storage`
- `declarativeNetRequest`
- `tabs` only if needed to read current tab URL from popup
- host permissions for provider endpoints:
  - `https://api.openai.com/*`
  - `https://api.deepseek.com/*`
  - `https://api.moonshot.ai/*`

Avoid:

- `<all_urls>` in MVP if possible.
- `history`.
- broad content script matches.
- remote hosted code.

Security reference: [Stay secure](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)

## Remote Code Rule

Chrome Web Store expects extension logic to be packaged with the extension. Do not download and execute remote JS at runtime.

BetterMe may call remote APIs, but it should not fetch executable prompt logic or JS code and run it.

Reference: [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)

