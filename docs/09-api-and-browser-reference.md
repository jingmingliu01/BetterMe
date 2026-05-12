# API 与浏览器参考

写代码时把这份放在旁边。这里的链接都已经过可访问性检查。

## 1. Chrome Extension Core

| Topic | Link | BetterMe 用途 |
| --- | --- | --- |
| Extension Get Started | https://developer.chrome.com/docs/extensions/get-started | 建立 extension 基础认知。 |
| Manifest | https://developer.chrome.com/docs/extensions/reference/manifest | 配置 MV3 extension。 |
| Service Workers | https://developer.chrome.com/docs/extensions/develop/concepts/service-workers | 理解 background service worker。 |
| Messaging | https://developer.chrome.com/docs/extensions/develop/concepts/messaging | UI page 和 background 通信。 |
| Runtime API | https://developer.chrome.com/docs/extensions/reference/api/runtime | `chrome.runtime.sendMessage`、extension URL、lifecycle。 |
| Content Scripts | https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts | 未来 blur overlay 可能用，MVP 不主用。 |
| Permissions | https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions | manifest permissions 策略。 |
| Match Patterns | https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns | host pattern 行为。 |
| activeTab | https://developer.chrome.com/docs/extensions/develop/concepts/activeTab | 用户点击 popup 后读取 current tab。 |

## 2. Blocking and Requests

| Topic | Link | BetterMe 用途 |
| --- | --- | --- |
| Declarative Net Request | https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest | Redirect blocked sites。 |
| Network Requests | https://developer.chrome.com/docs/extensions/develop/concepts/network-requests | Background 发 cross-origin fetch。 |
| Storage | https://developer.chrome.com/docs/extensions/reference/api/storage | 本地 settings 和简单状态。 |

## 3. Chrome Web Store and Policy

| Topic | Link | BetterMe 用途 |
| --- | --- | --- |
| Program Policies | https://developer.chrome.com/docs/webstore/program-policies/policies | 总体审核规则。 |
| User Data FAQ | https://developer.chrome.com/docs/webstore/program-policies/user-data-faq | Privacy disclosure 和数据使用边界。 |
| Explicit Material | https://developer.chrome.com/docs/webstore/program-policies/explicit-material/ | NSFW preset 风险边界。 |
| MV3 Requirements | https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements | Remote code 和 MV3 要求。 |
| Stay Secure | https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure | 最小权限、HTTPS、CSP。 |

## 4. OpenAI

| Topic | Link | BetterMe 用途 |
| --- | --- | --- |
| Chat Completions API | https://developers.openai.com/api/reference/resources/chat | 请求/响应格式。 |
| Structured Outputs | https://developers.openai.com/api/docs/guides/structured-outputs | OpenAI strict JSON schema。 |
| Models | https://developers.openai.com/api/docs/models | 检查模型名称和能力。 |
| Compare Models | https://developers.openai.com/api/docs/models/compare | 检查 endpoint/features 支持。 |
| SDKs and CLI | https://developers.openai.com/api/docs/libraries | SDK 参考。MVP 可不用 SDK。 |
| API Key Safety | https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety | API Key 安全建议。 |

## 5. DeepSeek

| Topic | Link | BetterMe 用途 |
| --- | --- | --- |
| Quick Start | https://api-docs.deepseek.com/ | Base URL 和兼容格式。 |
| Chat Completion | https://api-docs.deepseek.com/api/create-chat-completion | Request body 和 response。 |
| JSON Output | https://api-docs.deepseek.com/guides/json_mode | JSON mode。 |
| Error Codes | https://api-docs.deepseek.com/quick_start/error_codes | Error normalization。 |

## 6. Kimi

| Topic | Link | BetterMe 用途 |
| --- | --- | --- |
| Kimi Chat Completion | https://platform.kimi.ai/docs/api/chat | OpenAI-style chat endpoint。 |
| Kimi Quickstart | https://platform.kimi.ai/docs/api/quickstart | Setup 参考。 |
| Kimi Models | https://platform.kimi.ai/docs/api/models-overview | Model choices。 |
| Kimi Errors | https://platform.kimi.ai/docs/api/errors | Error normalization。 |

## 7. Web Platform APIs

| Topic | Link | BetterMe 用途 |
| --- | --- | --- |
| Web Crypto API | https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API | 本地加密 API Key。 |
| IndexedDB API | https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API | 存 CryptoKey 和结构化 local data。 |
| URL API | https://developer.mozilla.org/en-US/docs/Web/API/URL | Parse/normalize user input。 |

## 8. Minimal Manifest Sketch

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

## 9. Minimal Chat Completion Request

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

## 10. Decision Schema Validation

使用 Zod 或类似 validator。不要直接信任 LLM output。

```ts
const decisionValues = ["ALLOW", "DELAY", "ASK_MORE", "BLOCK"] as const;
```

Validation 应该在 background service worker，不在 UI component。
