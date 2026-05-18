# BetterMe

BetterMe 是一个 Chrome-only Manifest V3 浏览器插件，用来帮助用户在访问自己定义的高刺激网站前，通过一个 AI Checkpoint 做自控判断。

核心定位：

> Convince the AI before you continue, and it remembers your excuses.

当前 MVP 方向：

- 当前产品不做付费墙：Blocked Sites、Basic Cooldown、AI Check、Pattern Memory、Strictness 都不走付费 gate。
- AI Check 使用 BYOK：用户配置自己的 LLM API Key，插件在本地 background service worker 发起请求。
- MVP 不依赖 BetterMe Cloud Backend。LLM 请求由插件的 `background service worker` 在用户浏览器本地发出。

## 当前可运行 MVP

源码在 `apps/extension`，是一个 React + TypeScript + Manifest V3 extension。

本地开发：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

Chrome 加载方式：

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择 `apps/extension/dist`。

演示路径：

1. 打开 Settings，添加一个 blocked domain，例如 `youtube.com`。
2. 在 AI Check 区域选择 provider/model，并保存自己的 provider API key。
3. 打开 Block page，输入用户理由，得到 structured decision。
4. AI `ALLOW` 或 Basic Cooldown 完成后只创建临时访问，不会修改永久 blocklist。

## 文档入口

| 顺序 | 文档 | 用途 |
| --- | --- | --- |
| 1 | [Access State Design](docs/design/2026-05-12-access-state-design.md) | Blocked target、cooldown、temporary unlock、BlockHold、DNR 和 tab-level attempted URL 的统一设计。 |
| 2 | [Access State Progress](docs/design/2026-05-12-access-state-progress.md) | Access-state foundation 的实现进度和验证状态。 |
| 3 | [Access State Issues](docs/design/2026-05-12-access-state-issues.md) | Access-state 相关 issue、风险、关闭记录。 |
| 4 | [AI Track State Machine Design](docs/design/2026-05-12-ai-track-state-machine-design.md) | AI Chat / AI Check 的状态机、provider client、JSON decision、ALLOW/DELAY/ASK_MORE/BLOCK enforcement。 |
| 5 | [AI Track State Machine Progress](docs/design/2026-05-12-ai-track-state-machine-progress.md) | AI Track state machine 的实现进度。 |
| 6 | [AI Track State Machine Issues](docs/design/2026-05-12-ai-track-state-machine-issues.md) | AI Chat 当前待解决问题，包括真实 provider 调用、schema validation、DELAY/ASK_MORE/BLOCK UX。 |

## 当前 Non-Goals

- 不做 mobile app。
- 不做 accountability partner。
- 不做 community。
- MVP 不做 cloud AI ledger。
- MVP 不接 Codex app-server。
- 不读取 full browser history。
- 不读取 page content。
- MVP 不在 UI 里展示 NSFW URL 列表。
