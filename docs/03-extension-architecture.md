# 插件架构 Extension Architecture

## 1. 总览

BetterMe MVP 是一个 Chrome-only Manifest V3 Extension。

MVP 的 AI path 不经过 BetterMe Cloud Backend。插件自己的 `background service worker` 负责本地协调。

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

## 2. 什么是 Extension Backend

这里的 backend 不是你自己部署的 server。

它是：

- `apps/extension/src/background/service-worker.ts`
- 运行在用户浏览器本地。
- 没有 DOM。
- 响应 extension event。
- 处理 UI page 发来的 message。
- 读写 local storage / IndexedDB。
- 更新 DNR rules。
- 解密用户 API Key。
- 调用 LLM provider。
- 校验 AI structured decision。

它不能：

- 对用户隐藏代码。
- 保密 system prompt。
- 强力防止用户改本地代码。
- 安全保存你的共享 API Key。

官方文档：[Extension service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)

## 3. 推荐目录结构

```text
apps/
  extension/
    manifest.json
    package.json
    src/
      background/
        service-worker.ts
        message-router.ts
        dnr-rules.ts
        llm-runner.ts
      pages/
        onboarding/
          OnboardingPage.tsx
        popup/
          PopupPage.tsx
        block/
          BlockPage.tsx
          AIChatPanel.tsx
          ActionPanel.tsx
        settings/
          SettingsPage.tsx
          ProviderSettings.tsx
          BlockedSitesSettings.tsx
      storage/
        local-store.ts
        indexed-db.ts
        crypto-key-store.ts
      blocking/
        target-parser.ts
        match-rules.ts
        unlocks.ts
        timers.ts
      ai/
        checkpoint-schema.ts
        context-builder.ts
        prompt.ts
        provider-client.ts
        ai-track-state.ts
        pattern-memory.ts
      license/
        license-store.ts
        mock-license.ts
      shared/
        types.ts
        constants.ts
```

## 4. Runtime Components

### 4.1 `manifest.json`

`manifest.json` 类似 Web App 的配置入口 + iOS 的 Info.plist。它声明：

- extension name。
- version。
- `manifest_version: 3`。
- background service worker。
- permissions。
- host permissions。
- extension pages。
- action popup。

官方文档：

- [Manifest](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

### 4.2 Background Service Worker

职责：

- 接收 UI message。
- 管理 DNR rules。
- 管理 local data。
- 管理 AI Track state。
- 解密 API Key。
- 调用 LLM provider。
- 校验 structured output。
- 更新 Pattern Memory。

不要在 React component 里直接调用 LLM provider。React page 只负责 UI。

官方文档：

- [Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [chrome.runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime)

### 4.3 React Extension Pages

页面：

- `onboarding.html`
- `popup.html`
- `settings.html`
- `block.html`

这些页面本质是打包进 extension 的普通 Web 页面，可以用 React + TypeScript。

页面应该：

- 渲染 UI。
- 通过 `chrome.runtime.sendMessage` 调用 background。
- 显示 local state。

页面不应该：

- 直接拿 plaintext API Key。
- 直接调用 LLM provider。
- 读取 page content。

### 4.4 DeclarativeNetRequest

BetterMe 使用 `chrome.declarativeNetRequest` 做 redirect/block。

为什么适合：

- 不需要读取 request body。
- 不需要读取网页内容。
- 浏览器负责 matching。
- 比 content script overlay 更稳定。
- 更符合 privacy-first。

官方文档：[chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

### 4.5 Storage

使用：

- `chrome.storage.local`：简单 settings、blocked targets、temporary unlock。
- IndexedDB：AI Track、Pattern Memory、CryptoKey。

避免：

- 用 `chrome.storage.sync` 存 API Key。
- 把 plaintext API Key 存在任何持久化 storage。

官方文档：[chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## 5. Message Passing Contract

UI page 通过 typed message 调用 background。

```ts
type ExtensionMessage =
  | { type: "blockedTargets/add"; payload: AddBlockedTargetInput }
  | { type: "blockedTargets/list" }
  | { type: "blockedTargets/delete"; payload: { id: string } }
  | { type: "dnr/rebuildRules" }
  | { type: "license/getStatus" }
  | { type: "license/mockUnlock" }
  | { type: "provider/saveApiKey"; payload: SaveApiKeyInput }
  | { type: "provider/test" }
  | { type: "aiTrack/start"; payload: StartTrackInput }
  | { type: "aiTrack/sendMessage"; payload: SendTrackMessageInput }
  | { type: "aiTrack/getState"; payload: { trackId: string } };
```

统一返回：

```ts
type ExtensionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExtensionError };
```

## 6. Permission Strategy

MVP 权限尽量小：

- `storage`
- `declarativeNetRequest`
- `tabs`，仅当 popup 需要读取当前 tab URL。
- LLM provider host permissions：
  - `https://api.openai.com/*`
  - `https://api.deepseek.com/*`
  - `https://api.moonshot.ai/*`

尽量避免：

- `<all_urls>`。
- `history`。
- broad content script matches。
- remote code。

安全文档：[Stay secure](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)

## 7. Remote Code Rule

Extension 逻辑必须打包进插件。可以请求远程 API，但不能下载远程 JS 然后执行。

BetterMe 可以调用 OpenAI/DeepSeek/Kimi API，但不能从你的 server 下载一段 prompt runner JS 再运行。

官方文档：[Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
