# 实现路线图 Implementation Roadmap

这份 roadmap 按你手写代码的顺序排列。不要一开始就写 AI。先把 blocking 跑通。

更低颗粒度的文件/函数清单见：[File and Function Blueprint](11-file-function-blueprint.md)。

## Phase 0: Project Setup

目标：创建能被 Chrome 加载的 extension skeleton。

任务：

- 创建 `apps/extension`。
- 配置 Vite + React + TypeScript。
- 添加 `manifest.json`。
- 添加 background service worker entry。
- 添加 placeholder pages：
  - onboarding
  - popup
  - settings
  - block
- 在 Chrome `chrome://extensions` 里 Load unpacked。

验证：

- Extension 出现在 `chrome://extensions`。
- Popup 能打开。
- Settings page 能打开。
- Background service worker 能打印 test log。

文档：

- [Chrome Get Started](https://developer.chrome.com/docs/extensions/get-started)
- [Service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)

## Phase 1: Local Data Model

目标：先定义本地数据，再做 UI 和行为。

实现：

- `BlockedTarget`
- `UserSettings`
- `LicenseState`
- `TemporaryUnlock`
- `AITrack`
- `AITrackMessage`
- `AITrackSummary`
- `PatternMemory`

存储：

- Settings 用 `chrome.storage.local`。
- Track/memory 用 IndexedDB。

验证：

- 保存一个 setting。
- reload extension。
- 确认 setting 还在。

## Phase 2: Blocked Target Management

目标：用户可以 add/delete domain 和 exact URL。

实现：

- `normalizeBlockedTarget(input, mode)`。
- Domain validation。
- Exact URL validation。
- Settings UI list。
- Popup add current site flow。
- Advanced exact URL button。

验证：

- 添加 `youtube.com`。
- 添加 exact URL。
- 删除 target。
- 浏览器重启后数据仍存在。

## Phase 3: DNR Redirect

目标：访问 blocked target 时 redirect 到 Block Page。

实现：

- 把 `BlockedTarget` 转换为 DNR rules。
- `updateDynamicRules`。
- Redirect main-frame requests 到 `block.html`。
- Query params 传 `targetId` 和 original URL。

验证：

- blocked domain redirect。
- subdomain redirect。
- unrelated domain 不 redirect。
- exact URL 只 exact match。

文档：[chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

## Phase 4: Block Page UI

目标：不依赖 AI 也可用。

实现：

- Target display。
- `Leave Site` 或 `Close Tab`。
- `Start Cooldown`。
- 5-minute Basic Cooldown timer。
- Settings shortcut。
- Free 状态下 AI panel locked。

验证：

- Free user 可以 leave。
- Free user 可以 cooldown。
- AI panel 显示 locked reason。

## Phase 5: License Mock

目标：本地解锁 Lifetime BYOK 方便开发。

实现：

- Dev settings 的 mock unlock button。
- `LicenseState`。
- Feature gating。

验证：

- Free 状态下 provider setup disabled。
- Mock lifetime 后 provider setup enabled。

## Phase 6: Local API Key Encryption

目标：保存 provider API Key，但 storage 里没有 plaintext。

实现：

- `crypto-key-store.ts`。
- AES-GCM `CryptoKey`，`extractable: false`。
- CryptoKey 存 IndexedDB。
- API Key 加密。
- Ciphertext + IV 存本地。
- 只有 background 解密。

验证：

- 保存 key。
- reload browser。
- decrypt 仍能用。
- 检查 `chrome.storage.local` 没有 plaintext key。

文档：

- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## Phase 7: Provider Client

目标：background 能调用 OpenAI-compatible provider。

实现：

- `ProviderConfig`。
- `fetchChatCompletion`。
- provider base URLs。
- error normalization。
- API key test request。

Providers：

- OpenAI。
- DeepSeek。
- Kimi。

验证：

- valid key。
- invalid key。
- wrong model。
- UI 显示 provider-specific error。

## Phase 8: AI Check Mock

目标：先把 AI Track UI 和状态机跑通，再接真实 LLM。

实现：

- 本地 opening message。
- Chat UI。
- Track timeout。
- Turn counter。
- Mock decision generator。
- ALLOW/DELAY/ASK_MORE/BLOCK enforcement。

验证：

- ALLOW 创建 temporary unlock。
- DELAY 启动 timer 且 same track resume。
- ASK_MORE 添加 question。
- BLOCK 创建 hold 到本地第二天 00:00。

## Phase 9: Real AI Check

目标：把状态机接到真实 provider。

实现：

- Context builder。
- Gate Constitution。
- User Profile。
- Pattern Memory selection。
- Recent summaries。
- Current messages。
- Structured output schema。
- JSON parse + validation。
- Invalid JSON retry once。

验证：

- 真实 AI Check。
- JSON validates。
- Decision applies。
- Summary saved。
- Pattern Memory updates。

## Phase 10: Privacy and Data Controls

目标：让本地数据透明、可删除。

实现：

- Export local data。
- Delete API Key。
- Delete AI history。
- Delete all BetterMe data。
- Privacy copy。

验证：

- Export 不包含 plaintext API Key。
- Delete all 会清空 DNR rules 和 local data。

## Phase 11: NSFW Preset Placeholder

目标：有 category UX，但不展示 URL list。

实现：

- Preset list UI。
- `NSFW` 默认 off。
- Concrete URLs hidden。
- UI 只展示 category 和数量。

验证：

- Enable preset 后添加 DNR rules。
- UI 不展示成人 URL。
- User 可以 disable preset。

## Phase 12: Packaging and Manual QA

手动测试：

- Load unpacked extension。
- Add domain。
- Visit domain。
- Leave Site。
- Cooldown。
- Mock unlock。
- Save provider key。
- Real AI Check。
- ALLOW unlock。
- DELAY timer。
- BLOCK until next day。
- Export/delete data。

Policy review：

- Minimal permissions。
- No remote code。
- No history permission。
- No page content reading。
- NSFW URLs hidden。
- Privacy copy present。
