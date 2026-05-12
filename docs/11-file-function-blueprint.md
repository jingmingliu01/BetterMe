# 文件与函数蓝图 File and Function Blueprint

这份文档回答三个最具体的问题：

1. 我要写哪几个文件？
2. 每个文件里有哪些函数？
3. 每个函数负责什么？

它不是最终代码，但你可以按这个清单逐个手写实现。

## 1. 最小可运行目录

```text
apps/extension/
  manifest.json
  package.json
  vite.config.ts
  index.html
  src/
    background/
    pages/
    storage/
    blocking/
    ai/
    license/
    shared/
```

建议顺序：

1. `shared/types.ts`
2. `shared/constants.ts`
3. `storage/local-store.ts`
4. `blocking/target-parser.ts`
5. `background/message-router.ts`
6. `background/dnr-rules.ts`
7. `pages/settings/SettingsPage.tsx`
8. `pages/popup/PopupPage.tsx`
9. `pages/block/BlockPage.tsx`
10. `ai/*`

## 2. `shared/types.ts`

放所有跨模块共享的 type。

```ts
export type StrictnessLevel = "gentle" | "balanced" | "strict" | "monk";
export type BlockedTargetType = "domain" | "exactUrl";
export type AIDecision = "ALLOW" | "DELAY" | "ASK_MORE" | "BLOCK";
export type ProviderId = "openai" | "deepseek" | "kimi";
```

需要定义：

- `BlockedTarget`
- `TemporaryUnlock`
- `BlockHold`
- `UserSettings`
- `LicenseState`
- `LLMProviderConfig`
- `AITrack`
- `AITrackMessage`
- `CheckpointDecision`
- `AITrackSummary`
- `PatternMemory`
- `ExtensionMessage`
- `ExtensionResult<T>`
- `ExtensionError`

实现重点：

- Type 应该表达业务规则。
- 不要把 provider response 直接当业务 model。

## 3. `shared/constants.ts`

放固定配置。

函数/常量：

```ts
export const BASIC_COOLDOWN_SECONDS = 5 * 60;
export const AI_TRACK_MAX_ASSISTANT_TURNS = 5;
export const AI_TRACK_MAX_SECONDS = 10 * 60;
export const STRICTNESS_UNLOCK_CAP_MINUTES = {...};
export const PROVIDER_DEFAULTS = {...};
```

职责：

- 避免 magic number。
- 所有规则变更都能在这里或 decision record 找到。

## 4. `storage/local-store.ts`

封装 `chrome.storage.local`。

函数：

```ts
export async function getLocalValue<T>(key: string, fallback: T): Promise<T>;
export async function setLocalValue<T>(key: string, value: T): Promise<void>;
export async function removeLocalValue(key: string): Promise<void>;
export async function clearBetterMeLocalData(): Promise<void>;
```

职责：

- 统一 Promise wrapper。
- 处理 fallback。
- 不在业务代码里直接散落 `chrome.storage.local.get/set`。

## 5. `storage/indexed-db.ts`

封装 IndexedDB。

函数：

```ts
export async function openBetterMeDb(): Promise<IDBDatabase>;
export async function putRecord<T>(storeName: string, record: T): Promise<void>;
export async function getRecord<T>(storeName: string, id: string): Promise<T | null>;
export async function getAllRecords<T>(storeName: string): Promise<T[]>;
export async function deleteRecord(storeName: string, id: string): Promise<void>;
export async function clearStore(storeName: string): Promise<void>;
```

Object stores：

- `aiTracks`
- `aiTrackMessages`
- `aiTrackSummaries`
- `patternMemories`
- `cryptoKeys`
- `encryptedApiKeys`

职责：

- 处理 schema version。
- 让业务层不用碰 IndexedDB boilerplate。

## 6. `storage/crypto-key-store.ts`

处理 API Key 加密。

函数：

```ts
export async function generateCryptoKey(): Promise<CryptoKey>;
export async function saveCryptoKey(id: string, key: CryptoKey): Promise<void>;
export async function loadCryptoKey(id: string): Promise<CryptoKey | null>;
export async function encryptApiKey(apiKey: string, key: CryptoKey): Promise<{ ciphertextBase64: string; ivBase64: string }>;
export async function decryptApiKey(record: EncryptedApiKeyRecord, key: CryptoKey): Promise<string>;
export async function saveEncryptedApiKey(input: SaveApiKeyInput): Promise<EncryptedApiKeyRecord>;
export async function loadDecryptedApiKey(provider: ProviderId): Promise<string | null>;
export async function deleteApiKey(provider: ProviderId): Promise<void>;
```

职责：

- 不让 plaintext API Key 进入 React UI。
- 不把 plaintext 存 storage。
- 所有 crypto 相关逻辑集中在一处。

## 7. `blocking/target-parser.ts`

处理用户输入和 current tab URL。

函数：

```ts
export function parseHttpUrl(input: string): URL;
export function normalizeDomain(hostname: string): string;
export function normalizeDomainTarget(input: string): BlockedTarget;
export function normalizeExactUrlTarget(input: string): BlockedTarget;
export function getDisplayTarget(target: BlockedTarget): string;
export function isSupportedProtocol(url: URL): boolean;
```

职责：

- 区分 domain target 和 exact URL target。
- 确保只支持 `http` / `https`。
- 去掉 domain 前面的 `www.` 是否要做，先按 product decision 保守处理。

## 8. `blocking/match-rules.ts`

处理 target matching 的纯函数。

函数：

```ts
export function doesDomainMatch(hostname: string, domain: string): boolean;
export function doesExactUrlMatch(currentUrl: string, blockedUrl: string): boolean;
export function findMatchingTarget(url: string, targets: BlockedTarget[]): BlockedTarget | null;
```

职责：

- 方便 unit test。
- DNR rules 之外，本地 UI 判断也能用同一套逻辑。

## 9. `blocking/unlocks.ts`

管理 temporary unlock 和 block hold。

函数：

```ts
export function createTemporaryUnlock(input: CreateUnlockInput): TemporaryUnlock;
export function isUnlockActive(unlock: TemporaryUnlock, now: Date): boolean;
export function createBlockHoldUntilNextDay(input: CreateBlockHoldInput, now: Date): BlockHold;
export function isBlockHoldActive(hold: BlockHold, now: Date): boolean;
export function getNextLocalMidnight(now: Date): Date;
```

职责：

- `BLOCK` 到本地第二天 00:00 的逻辑必须在这里。
- 时间逻辑必须可测。

## 10. `blocking/timers.ts`

处理 countdown 相关纯函数。

函数：

```ts
export function createCooldownTimer(now: Date, seconds: number): CountdownTimer;
export function getRemainingSeconds(expiresAt: string, now: Date): number;
export function isTimerExpired(expiresAt: string, now: Date): boolean;
```

职责：

- Basic Cooldown 和 AI DELAY 都用这套 timer helper。

## 11. `background/dnr-rules.ts`

把 `BlockedTarget` 转换成 Chrome DNR rules。

函数：

```ts
export function buildRedirectUrl(targetId: string, originalUrl: string): string;
export function buildDomainRule(target: BlockedTarget, ruleId: number): chrome.declarativeNetRequest.Rule;
export function buildExactUrlRule(target: BlockedTarget, ruleId: number): chrome.declarativeNetRequest.Rule;
export function buildDnrRules(targets: BlockedTarget[]): chrome.declarativeNetRequest.Rule[];
export async function replaceDynamicRules(rules: chrome.declarativeNetRequest.Rule[]): Promise<void>;
export async function rebuildBlockingRules(): Promise<void>;
```

职责：

- 只处理 DNR。
- 不处理 React state。
- 不处理 AI decision。

## 12. `background/message-router.ts`

集中处理 UI message。

函数：

```ts
export function registerMessageRouter(): void;
async function handleMessage(message: ExtensionMessage): Promise<ExtensionResult<unknown>>;
function toExtensionError(error: unknown): ExtensionError;
```

Message handlers：

- `blockedTargets/add`
- `blockedTargets/list`
- `blockedTargets/delete`
- `license/getStatus`
- `license/mockUnlock`
- `provider/saveApiKey`
- `provider/test`
- `aiTrack/start`
- `aiTrack/sendMessage`
- `aiTrack/getState`

职责：

- UI page 只和 message-router 对话。
- 所有错误统一转换。

## 13. `background/service-worker.ts`

Service worker entry。

函数：

```ts
import { registerMessageRouter } from "./message-router";

registerMessageRouter();

chrome.runtime.onInstalled.addListener(async () => {
  await rebuildBlockingRules();
});
```

职责：

- 尽量薄。
- 注册 listener。
- 安装/启动时恢复 DNR rules。

## 14. `ai/checkpoint-schema.ts`

定义和校验 structured decision。

函数：

```ts
export function parseCheckpointDecision(rawText: string): CheckpointDecision;
export function validateCheckpointDecision(value: unknown): CheckpointDecision;
export function isFinalDecision(decision: AIDecision): boolean;
export function clampUnlockMinutes(decision: CheckpointDecision, strictness: StrictnessLevel): CheckpointDecision;
```

职责：

- LLM output 必须经过这里。
- 不允许 UI 直接 parse JSON。

## 15. `ai/prompt.ts`

放 prompt builder。

函数：

```ts
export function buildGateConstitution(): string;
export function buildSystemPrompt(input: PromptInput): string;
export function buildInvalidJsonRetryPrompt(schemaDescription: string): string;
export function buildLocalOpeningMessage(displayTarget: string): string;
```

职责：

- Prompt 统一管理。
- Opening message 本地生成。
- JSON-only 规则清楚。

## 16. `ai/context-builder.ts`

构造 LLM context。

函数：

```ts
export async function buildCheckpointContext(input: BuildContextInput): Promise<ChatMessage[]>;
export async function loadRelevantPatternMemory(targetId: string): Promise<PatternMemory[]>;
export async function loadRecentTrackSummaries(targetId: string): Promise<AITrackSummary[]>;
export function buildCurrentTrackMessages(messages: AITrackMessage[]): ChatMessage[];
```

职责：

- 不发送全部 raw history。
- 只发送必要 context layers。

## 17. `ai/provider-client.ts`

OpenAI-compatible fetch client。

函数：

```ts
export async function fetchChatCompletion(input: ChatCompletionInput): Promise<ChatCompletionOutput>;
export function buildProviderUrl(config: LLMProviderConfig): string;
export function buildProviderHeaders(apiKey: string): Record<string, string>;
export function extractAssistantText(response: unknown): string;
export function normalizeProviderError(error: unknown): ProviderError;
export async function testProviderKey(config: LLMProviderConfig): Promise<void>;
```

职责：

- 不关心 UI。
- 不关心 DNR。
- 只负责 provider request/response。

## 18. `ai/ai-track-state.ts`

AI Track 状态机。

函数：

```ts
export function createAITrack(input: StartTrackInput, now: Date): AITrack;
export function addLocalOpeningMessage(track: AITrack, displayTarget: string, now: Date): AITrackMessage;
export function canSendUserMessage(track: AITrack, now: Date): boolean;
export function applyDecision(track: AITrack, decision: CheckpointDecision, now: Date): AITrackTransitionResult;
export function expireTrackIfNeeded(track: AITrack, now: Date): AITrack;
```

职责：

- 集中处理 ALLOW/DELAY/ASK_MORE/BLOCK。
- 保证 max turns 和 max duration。

## 19. `ai/pattern-memory.ts`

处理 Pattern Memory。

函数：

```ts
export async function summarizeTrack(trackId: string): Promise<AITrackSummary>;
export async function updatePatternMemoryFromDecision(input: PatternMemoryUpdateInput): Promise<void>;
export function mergePatternNote(oldNote: string | null, newNote: string | null): string | null;
export function computeFrequencyScore(previousScore: number, now: Date, lastSeenAt?: string): number;
```

职责：

- 让 AI “记得借口”。
- 不保存全部 raw transcript 作为长期 memory。

## 20. `ai/llm-runner.ts`

把 context、provider、schema、state 串起来。

函数：

```ts
export async function runCheckpointTurn(input: RunCheckpointTurnInput): Promise<RunCheckpointTurnResult>;
async function callProviderWithRetry(input: ProviderCallInput): Promise<CheckpointDecision>;
async function handleInvalidJsonRetry(input: RetryInput): Promise<CheckpointDecision>;
```

职责：

- 一次 user message -> 一次 LLM turn -> 一个 validated decision。
- invalid JSON retry 一次。
- provider error 转换成 `provider_error`。

## 21. `license/mock-license.ts`

本地 mock unlock。

函数：

```ts
export async function getLicenseState(): Promise<LicenseState>;
export async function enableMockLifetime(): Promise<LicenseState>;
export async function disableMockLifetime(): Promise<LicenseState>;
export function hasFeature(state: LicenseState, feature: LicenseFeature): boolean;
```

职责：

- MVP 不接真实 payment。
- 先把 feature gate 跑通。

## 22. React Pages

### `pages/popup/PopupPage.tsx`

职责：

- 读取当前 tab。
- 显示 `Block this site`。
- 默认添加 domain。
- Advanced 展示 exact URL option。

主要函数：

```ts
async function loadCurrentTabUrl(): Promise<string>;
async function addCurrentDomain(): Promise<void>;
async function addExactCurrentUrl(): Promise<void>;
```

### `pages/settings/SettingsPage.tsx`

职责：

- 管理 blocked targets。
- 管理 strictness。
- 管理 provider settings。
- 管理 privacy/export/delete。
- Dev mock unlock。

主要组件：

- `BlockedSitesSettings`
- `ProviderSettings`
- `PrivacySettings`
- `LicenseSettings`

### `pages/block/BlockPage.tsx`

职责：

- 读取 `targetId` 和 original URL。
- 显示 target status。
- 渲染 left action area。
- 渲染 right AI panel。

主要函数：

```ts
function loadBlockPageState(): Promise<BlockPageState>;
async function startCooldown(): Promise<void>;
async function leaveSite(): Promise<void>;
async function startAITrack(): Promise<void>;
async function sendAIMessage(content: string): Promise<void>;
```

### `pages/block/AIChatPanel.tsx`

职责：

- 显示 opening message。
- 显示 messages。
- 显示 turns/time remaining。
- 显示 locked/unavailable/provider error。
- 显示 final decision。

### `pages/block/ActionPanel.tsx`

职责：

- `Leave Site` / `Close Tab`。
- `Start Cooldown`。
- Countdown。
- Settings shortcut。

## 23. 第一批 Unit Tests

优先写这些：

- `normalizeDomainTarget`
- `normalizeExactUrlTarget`
- `doesDomainMatch`
- `doesExactUrlMatch`
- `getNextLocalMidnight`
- `clampUnlockMinutes`
- `validateCheckpointDecision`
- `normalizeProviderError`

## 24. 手写实现建议

顺序：

1. 先写 pure functions。
2. 再写 storage wrappers。
3. 再写 message router。
4. 再写 UI。
5. 最后接 provider。

原因：

- Pure functions 容易测。
- Storage 和 message router 稳定后，UI 更好写。
- Provider 最后接，避免被 API 问题卡住核心体验。
