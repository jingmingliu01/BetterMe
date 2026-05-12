# BetterMe 产品 PRD

## 1. 产品定位

BetterMe 是一个 privacy-first 的 Chrome Extension，用来帮助用户控制自己访问高刺激网站的冲动。

它不是普通 porn blocker，也不是普通 productivity blocker。它的核心体验是：

> 当用户访问自己加入 Blocked List 的网站时，BetterMe 会把用户带到一个 AI Checkpoint。用户必须说服 AI：这次访问是 deliberate decision，而不是 impulsive escape。

核心 slogan：

> Convince the AI before you continue, and it remembers your excuses.

## 2. 目标用户

MVP 目标用户：

- 熟悉 Chrome Extension 或 AI 工具的 early adopters。
- 愿意使用自己的 LLM API Key 的用户。
- 不想注册另一个账号、不想订阅另一个 AI 服务的人。
- 想要私密、自主、自控工具的人。

MVP 不优先服务：

- 家长控制小孩的 parental control 场景。
- 企业设备管理。
- 移动端用户。
- 需要 cloud sync 和 account recovery 的大众用户。

## 3. 产品分层

### Free Tier

Free 版本必须是可用的 blocker，不是残缺 demo。

Free 包含：

- 无限数量的 Blocked Sites。
- Domain blocking。
- Advanced UI 中的 exact URL blocking。
- Block Page。
- Basic Cooldown。
- Settings。
- AI Check UI 完整存在，但处于 locked state。

Free 不包含：

- 可用的 AI Check。
- API Key 输入能力。
- Pattern Memory。
- Advanced Strictness。

### Lifetime BYOK

Lifetime License 解锁完整本地功能。

Lifetime 包含：

- AI Check。
- 用户自己的 LLM API Key。
- Pattern Memory。
- Advanced Strictness。
- Free tier 的所有 blocker 功能。

Lifetime 不包含：

- BetterMe hosted AI。
- Monthly AI Check allowance。
- Subscription entitlement。
- Account sync。
- Account recovery。

设备规则：

- 未来 License Endpoint 默认支持 3 台设备。
- MVP 先使用 local mock unlock。

### Future Cloud Subscription

未来 Cloud Subscription 可能包含：

- Login。
- Stripe subscription。
- Monthly AI checks。
- Top-up AI checks。
- BetterMe backend LLM gateway。
- AI Track ledger。
- Account recovery。
- Cross-device sync。

这些都不属于 MVP。

## 4. MVP Scope

MVP 必须实现：

- Chrome-only Manifest V3 extension。
- React + TypeScript UI。
- Onboarding page。
- Popup 或 Settings 中添加 blocked site。
- Domain block：阻断 domain 和所有 subdomains。
- Exact URL block：通过 Advanced UI 支持 exact only。
- DNR redirect 到 Block Page。
- `Leave Site` 或 `Close Tab`。
- Basic Cooldown，默认 5 分钟。
- Free tier 下 AI Check UI locked。
- Lifetime local mock unlock。
- Provider settings：OpenAI、DeepSeek、Kimi。
- API Key 本地加密保存。
- AI opening message 本地生成，不调用 LLM。
- OpenAI-compatible Chat Completions 请求。
- Structured AI decision validation。
- `ALLOW` 后 temporary unlock。
- `DELAY` 后 timer，结束后继续同一个 track。
- `ASK_MORE` 后继续同一个 track。
- `BLOCK` 后阻断到本地时间第二天 00:00。
- Track Summary。
- Pattern Memory。
- Local data export/delete。

## 5. Out of Scope

- Mobile app。
- Accountability partner。
- Community。
- Complex analytics dashboard。
- Cross-browser release。
- Full legal automation。
- 真实 payment。
- 真实 License Endpoint。
- Hosted AI backend。
- 读取 local files 作为 memory。
- Full browser history analysis。
- Page content reading。
- NSFW URL 在 UI 中展示。

## 6. 核心用户流程

### 6.1 Onboarding

1. 用户安装 BetterMe。
2. 用户看到产品解释。
3. 用户添加第一个 blocked site。
4. 用户选择 strictness。
5. 用户看到 AI Check 是 Lifetime 功能，但 UI 已经完整存在。

### 6.2 添加当前网站

1. 用户点击 extension icon。
2. BetterMe 读取当前 tab URL。
3. 默认展示：添加整个 domain 和 subdomains。
4. Advanced 展开后展示：只阻断当前 exact URL。
5. BetterMe 保存 target 并更新 DNR rules。

### 6.3 访问被阻断网站

1. 用户访问 blocked target。
2. DNR 把 main frame redirect 到 `block.html`。
3. Block Page 显示 target、状态和操作区。
4. 右侧显示 AI Check Chatbot 区。

### 6.4 Free 用户看到 AI Check

1. AI Check UI 可见。
2. 输入框 locked。
3. 显示解锁说明。
4. 用户仍可使用 `Leave Site` 和 `Basic Cooldown`。

### 6.5 Lifetime BYOK 用户使用 AI Check

1. 用户通过 local mock unlock Lifetime。
2. 用户选择 provider 和 model。
3. 用户输入 API Key。
4. BetterMe 本地加密保存 API Key。
5. 用户访问 blocked site。
6. Block Page 本地生成 opening message。
7. 用户回复。
8. `background service worker` 调用 LLM provider。
9. BetterMe 校验 structured decision。
10. BetterMe 执行 ALLOW / DELAY / ASK_MORE / BLOCK。

## 7. AI 语气原则

AI 应该：

- Non-shaming。
- Calm。
- Direct。
- Focus on deliberate vs impulsive decision。
- Challenge repeated excuses。
- Respect strictness。

AI 不应该：

- 生成 explicit sexual content。
- Moral judgment。
- Insult 或 shame 用户。
- 假装 BetterMe 无法绕过。

