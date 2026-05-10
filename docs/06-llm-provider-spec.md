# LLM Provider Spec

## MVP Provider Scope

MVP supports:

- OpenAI.
- DeepSeek.
- Kimi.

MVP does not support:

- Anthropic.
- Gemini.
- OpenRouter.
- Codex app-server.
- BetterMe hosted AI backend.

## API Style

Use OpenAI-compatible Chat Completions.

BetterMe should implement a small fetch client instead of using the OpenAI JavaScript SDK in the extension.

Reasons:

- Smaller bundle.
- More control over browser extension behavior.
- Easier to normalize provider-specific errors.
- Avoids SDK browser warnings and extra runtime assumptions.
- All MVP providers support OpenAI-style chat completions.

OpenAI SDK docs are still useful for reference:

- [OpenAI SDKs and CLI](https://developers.openai.com/api/docs/libraries)
- [openai-node](https://github.com/openai/openai-node)

## Provider Config

```ts
type ProviderId = "openai" | "deepseek" | "kimi";

interface LLMProviderConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  encryptedApiKeyId: string;
}
```

Default configs:

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

Model lists may drift. Treat these as starter defaults, not permanent truth.

Provider docs:

- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [DeepSeek Quick Start](https://api-docs.deepseek.com/)
- [DeepSeek Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [Kimi Chat Completion](https://platform.kimi.ai/docs/api/chat)

## Request Shape

Generic request:

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

HTTP:

```http
POST {baseUrl}/chat/completions
Content-Type: application/json
Authorization: Bearer {apiKey}
```

## Structured Output Strategy

### OpenAI

Use structured outputs when supported by selected model:

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

DeepSeek supports JSON Output with:

```json
{
  "response_format": { "type": "json_object" }
}
```

Also instruct the model to produce JSON in the system message.

DeepSeek warns that JSON output still needs explicit JSON instructions.

### Kimi

Use OpenAI-compatible chat completions and strict prompt instructions.

If function/tool calling is stable enough, it can later be used to force schema. MVP can use:

- strong system prompt
- JSON-only instruction
- local Zod validation
- one retry on invalid JSON

## Error Normalization

Normalize provider errors into:

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

UI should show specific but calm messages:

- "API key rejected by provider."
- "Provider says quota or balance is insufficient."
- "Selected model is not available for this key."
- "Network request failed. Check provider endpoint and connection."

## CORS Risk

Browser extension background service workers can make cross-origin requests when host permissions are declared, but provider behavior can still vary.

If a provider blocks browser-origin calls despite extension permissions, future fallback options:

1. Local bridge.
2. BetterMe BYOK relay backend.
3. Cloud subscription backend.

MVP should first test direct extension fetch.

Reference: [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)

## API Key Handling

Provider client receives plaintext API key only in memory:

```text
decrypt key
  -> build request
  -> fetch provider
  -> discard plaintext reference
```

Do not:

- Log API key.
- Store API key plaintext.
- Send API key to BetterMe.
- Put API key in content script.

## Provider UI

Settings page:

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

Provider/model dropdowns are enabled only after Lifetime is unlocked.

API key field is enabled only after provider is selected.

## Testing Checklist

For each provider:

- Save key.
- Test key.
- Send one valid AI Check.
- Handle invalid key.
- Handle wrong model name.
- Handle invalid JSON response through mocked response.
- Confirm no key appears in logs.

