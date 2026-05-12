# 面试学习指南 Interview Learning Guide

这个项目很适合作为 SDE Interview 项目，因为它同时包含 frontend、browser platform APIs、本地安全、state machine、API integration 和 privacy tradeoff。

## 1. 项目一句话介绍

可以这样说：

> I built a Chrome Manifest V3 extension that lets users block self-defined websites. When they visit a blocked target, the extension redirects them into a privacy-first AI checkpoint. Free users get basic blocking and cooldown; lifetime BYOK users can connect their own LLM API key. The extension stores data locally, encrypts API keys, uses declarativeNetRequest for blocking, and validates structured AI decisions before enforcing unlock, delay, or block outcomes.

## 2. 面试可讲的技术点

### 2.1 Browser Extension Architecture

要讲清楚：

- Manifest V3。
- Background service worker。
- Extension pages。
- Message passing。
- DNR redirect。
- Local storage 和 IndexedDB。

表达方式：

> I treated the background service worker as the privileged local coordinator. React pages only render UI and send typed messages. Provider calls, DNR updates, and key decryption all happen in the service worker.

### 2.2 Privacy-First Blocking

要讲清楚：

- 不读取 browser history。
- 不读取 page content。
- 只存用户自己添加的 domain/exact URL。
- 用 DNR 做 redirect。

Tradeoff：

- Redirect page 没有 blur overlay 那么酷。
- 但更稳定、更隐私、更适合 MVP。

### 2.3 State Machine Design

AI Track 状态：

```text
ready -> active -> ask_more -> delayed -> active
active -> allowed
active -> blocked
active -> expired
active -> provider_error
```

表达方式：

> I represented AI Check as a bounded state machine instead of letting UI branches grow organically. That made ALLOW, DELAY, ASK_MORE, BLOCK, timeout, and provider error behavior deterministic.

### 2.4 Structured LLM Output

要讲清楚：

- LLM output 是 untrusted。
- 必须 schema validation。
- invalid JSON retry 一次。
- 只有 validated decision 才能影响 blocker。
- 本地会 clamp unlock duration。

表达方式：

> The model recommends a decision, but the extension enforces policy.

### 2.5 BYOK Security

要讲清楚：

- API Key 不发给 BetterMe。
- Key 本地加密。
- Non-extractable CryptoKey in IndexedDB。
- Ciphertext in local storage/IndexedDB。
- Plaintext 只在内存短暂存在。

Tradeoff：

- 防不了 malware。
- 防不了用户修改 extension。
- 但比 plaintext storage 好，且 UX 简单。

### 2.6 Provider Adapter Design

要讲清楚：

- MVP 只做 OpenAI、DeepSeek、Kimi。
- 三者统一走 OpenAI-compatible Chat Completions。
- 轻量 `fetch` client 足够。
- Provider-specific error 被 normalize。

表达方式：

> I avoided a heavy SDK because I only needed one endpoint and wanted full control over headers, errors, and browser behavior.

### 2.7 Product and Policy Constraints

要讲清楚：

- Chrome Web Store 要求 minimal permissions。
- NSFW preset 不展示 URL list。
- 不执行 remote code。
- Privacy copy 必须清楚。

表达方式：

> Browser extension development is not just frontend. Platform policy and permission design shape the architecture.

## 3. 常见面试问题

### 为什么 BYOK 不走自己的 backend？

回答：

> For the lifetime BYOK MVP, the product promise is no BetterMe account or subscription. Direct provider calls keep the user's API key and usage between the user and provider. It reduces backend complexity and privacy risk. The tradeoff is that prompts and local code are visible.

### 为什么不做 blur overlay？

回答：

> Blur overlay requires loading the original page and injecting a content script. That can briefly expose blocked content and increases compatibility risk. DNR redirect is more deterministic and privacy-preserving.

### 怎么防止用户重复借口？

回答：

> I do not send raw full history. I store structured summaries and Pattern Memory, then include only relevant repeated patterns in the next checkpoint context.

### 模型返回 malformed JSON 怎么办？

回答：

> The extension validates every response. If parsing or schema validation fails, it retries once. If it still fails, AI panel enters provider error state and no access is granted.

### 以后怎么加 subscription？

回答：

> I would add a cloud backend with auth, Stripe webhooks, entitlement state, and an AI Track ledger. The provider layer already abstracts BYOK, so cloud-hosted AI can be another provider.

## 4. 值得重点实现的代码文件

这些文件最能体现工程能力：

- `target-parser.ts`
- `dnr-rules.ts`
- `ai-track-state.ts`
- `checkpoint-schema.ts`
- `provider-client.ts`
- `crypto-key-store.ts`
- `context-builder.ts`

## 5. 测试可以怎么讲

Unit tests：

- Domain normalization。
- Exact URL matching。
- Unlock expiry。
- Block until next local midnight。
- AI decision validation。
- Provider error normalization。

Integration tests：

- Add blocked domain -> DNR rule generated。
- Blocked visit -> redirect URL generated。
- ALLOW -> temporary unlock。
- DELAY -> same track resumes。
- BLOCK -> hold until next day。

Manual tests：

- Load unpacked extension。
- Verify permissions。
- Invalid API Key。
- Confirm no plaintext API Key in storage。

## 6. Resume Bullet Drafts

只有实现后再放简历：

- Built a Chrome Manifest V3 extension using React and TypeScript to block user-defined domains via declarativeNetRequest and redirect users into a structured self-control checkpoint flow.
- Designed a local AI Track state machine with bounded turns, timeout handling, temporary unlocks, delay timers, and block-until-next-day enforcement.
- Implemented BYOK LLM integration for OpenAI-compatible providers with encrypted local API key storage, provider error normalization, and schema-validated model decisions.
- Built a privacy-first local memory layer that stores summaries and repeated-pattern signals without reading browser history or page content.
