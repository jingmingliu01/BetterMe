# LLM Provider 规格

## 1. MVP Provider Scope

MVP 支持：

- OpenAI。
- DeepSeek。
- Kimi。

MVP 不支持：

- Anthropic。
- Gemini。
- OpenRouter。
- Codex app-server。
- BetterMe hosted AI backend。

## 2. API Style

MVP 统一使用 OpenAI-compatible Chat Completions。

BetterMe 应该手写一个很薄的 `fetch` client，而不是在 extension 里依赖 OpenAI JavaScript SDK。

原因：

- Bundle 更小。
- 更容易控制 browser extension 里的 headers/error handling。
- OpenAI、DeepSeek、Kimi 都能走 Chat Completions 风格。
- SDK 在浏览器中使用通常需要接受 client-side key 暴露风险。

参考：

- [OpenAI SDKs and CLI](https://developers.openai.com/api/docs/libraries)
- [openai-node](https://github.com/openai/openai-node)

## 3. Provider Config

```ts
type ProviderId = "openai" | "deepseek" | "kimi";

interface LLMProviderConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  encryptedApiKeyId: string;
}
```

默认配置：

```ts
const defaultProviders = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-4.1-mini"]
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"]
  },
  kimi: {
    baseUrl: "https://api.moonshot.ai/v1",
    models: ["kimi-k2.6"]
  }
};
```

模型列表会变。实现时把它当 starter defaults，允许用户输入 custom model name。

Provider docs：

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [DeepSeek Quick Start](https://api-docs.deepseek.com/)
- [DeepSeek Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [Kimi Chat Completion](https://platform.kimi.ai/docs/api/chat)

## 4. Request Shape

```ts
interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: unknown;
}
```

HTTP：

```http
POST {baseUrl}/chat/completions
Content-Type: application/json
Authorization: Bearer {apiKey}
```

## 5. Structured Output Strategy

### OpenAI

优先使用 structured outputs：

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "betterme_checkpoint_decision",
      "strict": true,
      "schema": {}
    }
  }
}
```

### DeepSeek

DeepSeek 可以使用 JSON Output：

```json
{
  "response_format": { "type": "json_object" }
}
```

仍然要在 system prompt 中明确要求 JSON。

### Kimi

Kimi 使用 OpenAI-compatible Chat Completions。

MVP 策略：

- strict system prompt。
- JSON-only instruction。
- local schema validation。
- invalid JSON retry 一次。

## 6. Error Normalization

统一错误码：

```ts
type ProviderErrorCode =
  | "missing_api_key"
  | "invalid_api_key"
  | "insufficient_quota"
  | "rate_limited"
  | "model_not_found"
  | "cors_or_network"
  | "invalid_json"
  | "provider_unavailable"
  | "unknown";
```

UI 文案：

- `API key rejected by provider.`
- `Provider says quota or balance is insufficient.`
- `Selected model is not available for this key.`
- `Network request failed. Check provider endpoint and connection.`

## 7. CORS Risk

Extension background service worker 通常可以在声明 host permissions 后发 cross-origin request。

但如果某个 provider 拒绝 browser-origin call，未来 fallback：

1. Local bridge。
2. BetterMe BYOK relay backend。
3. BetterMe Cloud Subscription backend。

MVP 先测试 direct extension fetch。

参考：[Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

## 8. API Key Handling

Provider client 只在内存中短暂拿到 plaintext key：

```text
decrypt key
  -> build request
  -> fetch provider
  -> discard plaintext reference
```

不要：

- log API Key。
- plaintext 存储 API Key。
- 发给 BetterMe。
- 暴露给 content script。

## 9. Provider UI

Settings page：

```text
Provider
  [OpenAI v]

Model
  [gpt-5.4-mini v]

API Key
  [*************]
  [Save Key]
  [Test Key]
  [Delete Key]
```

规则：

- Lifetime locked 时 provider settings disabled。
- Provider 选好后才能输入 API Key。
- API Key 保存后才能 test。
- Model dropdown 允许 custom model name。

## 10. Testing Checklist

每个 provider 都要测：

- 保存 key。
- test key。
- invalid key。
- wrong model。
- mocked invalid JSON。
- provider error normalization。
- 确认 logs 里没有 API Key。
