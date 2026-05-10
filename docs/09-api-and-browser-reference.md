# API and Browser Reference

Keep this file next to your editor while implementing.

## Chrome Extension Core

| Topic | Link | Use in BetterMe |
| --- | --- | --- |
| Extension Get Started | https://developer.chrome.com/docs/extensions/get-started | Basic mental model and first extension workflow. |
| Manifest | https://developer.chrome.com/docs/extensions/reference/manifest | Configure MV3 extension. |
| Service Workers | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers | Background service worker architecture. |
| Messaging | https://developer.chrome.com/docs/extensions/develop/concepts/messaging | UI page to background communication. |
| Runtime API | https://developer.chrome.com/docs/extensions/reference/api/runtime | `chrome.runtime.sendMessage`, URLs, lifecycle. |
| Content Scripts | https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts | Future blur overlay, not MVP. |
| Permissions | https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions | Manifest permission strategy. |
| Match Patterns | https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns | Host pattern behavior. |
| activeTab | https://developer.chrome.com/docs/extensions/develop/concepts/activeTab | Read current tab after user action if needed. |

## Blocking and Requests

| Topic | Link | Use in BetterMe |
| --- | --- | --- |
| Declarative Net Request | https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest | Redirect blocked sites to block page. |
| Network Requests | https://developer.chrome.com/docs/extensions/develop/concepts/network-requests | Cross-origin fetch from extension. |
| Storage | https://developer.chrome.com/docs/extensions/reference/api/storage | Local settings and simple state. |

## Chrome Web Store and Policy

| Topic | Link | Use in BetterMe |
| --- | --- | --- |
| Program Policies | https://developer.chrome.com/docs/webstore/program-policies/policies | General review constraints. |
| User Data FAQ | https://developer.chrome.com/docs/webstore/program-policies/user-data-faq | Privacy policy and data handling. |
| Explicit Material | https://developer.chrome.com/docs/webstore/program-policies/explicit-material/ | NSFW preset caution. |
| MV3 Requirements | https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements | Remote code and MV3 rules. |
| Stay Secure | https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure | Minimal permissions, HTTPS, CSP. |
| User Data FAQ | https://developer.chrome.com/docs/webstore/program-policies/user-data-faq | Privacy-first behavior and disclosure expectations. |

## OpenAI

| Topic | Link | Use in BetterMe |
| --- | --- | --- |
| Chat Completions API | https://developers.openai.com/api/reference/resources/chat | Request/response shape. |
| Structured Outputs | https://developers.openai.com/api/docs/guides/structured-outputs | Strict JSON schema for OpenAI models. |
| Models | https://developers.openai.com/api/docs/models | Model choice and model drift check. |
| Compare Models | https://developers.openai.com/api/docs/models/compare | Check supported endpoints/features. |
| SDKs and CLI | https://developers.openai.com/api/docs/libraries | SDK reference, even if MVP uses fetch. |
| API Key Safety | https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety | Key safety warning and best practices. |

## DeepSeek

| Topic | Link | Use in BetterMe |
| --- | --- | --- |
| Quick Start | https://api-docs.deepseek.com/ | OpenAI-compatible base URL and starter models. |
| Chat Completion | https://api-docs.deepseek.com/api/create-chat-completion | Request body and JSON output behavior. |
| JSON Output | https://api-docs.deepseek.com/guides/json_mode | JSON mode reference if needed. |
| Error Codes | https://api-docs.deepseek.com/quick_start/error_codes | Normalize provider errors. |

## Kimi

| Topic | Link | Use in BetterMe |
| --- | --- | --- |
| Kimi Chat Completion | https://platform.kimi.ai/docs/api/chat | OpenAI-style chat endpoint. |
| Kimi Quickstart | https://platform.kimi.ai/docs/api/quickstart | Setup reference. |
| Kimi Models | https://platform.kimi.ai/docs/api/models-overview | Model choices and parameter reference. |
| Kimi Errors | https://platform.kimi.ai/docs/api/errors | Normalize provider errors. |

## Web Platform APIs

| Topic | Link | Use in BetterMe |
| --- | --- | --- |
| Web Crypto API | https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API | Encrypt API keys locally. |
| IndexedDB API | https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API | Store CryptoKey and structured local data. |
| URL API | https://developer.mozilla.org/en-US/docs/Web/API/URL | Parse and normalize user input. |

## Minimal Manifest Sketch

```json
{
  "manifest_version": 3,
  "name": "BetterMe",
  "version": "0.1.0",
  "permissions": [
    "storage",
    "declarativeNetRequest"
  ],
  "host_permissions": [
    "https://api.openai.com/*",
    "https://api.deepseek.com/*",
    "https://api.moonshot.ai/*"
  ],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

## Minimal Chat Completion Request

```ts
async function createChatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  responseFormat
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  responseFormat?: unknown;
}) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 800,
      response_format: responseFormat
    })
  });

  if (!response.ok) {
    throw new Error(`Provider error: ${response.status}`);
  }

  return response.json();
}
```

## Decision Schema Validation

Use Zod or similar local validator. Do not trust model output directly.

```ts
const decisionValues = ["ALLOW", "DELAY", "ASK_MORE", "BLOCK"] as const;
```

Validation belongs in background service worker, not UI components.
