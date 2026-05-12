# BetterMe 文档入口

BetterMe 是一个 Chrome-only Manifest V3 浏览器插件，用来帮助用户在访问自己定义的高刺激网站前，通过一个 AI Checkpoint 做自控判断。

核心定位：

> Convince the AI before you continue, and it remembers your excuses.

当前 MVP 方向已经从“手写代码练习”调整为“AI Native PM 面试展示基石”：

- Free tier：无限 Blocked Sites，AI Check UI 已经存在但锁住。
- Lifetime BYOK tier：解锁 AI Check、Pattern Memory、Advanced Strictness，并允许用户配置自己的 LLM API Key。
- MVP 不依赖 BetterMe Cloud Backend。LLM 请求由插件的 `background service worker` 在用户浏览器本地发出。
- 未来 Cloud Subscription 可以加入登录、Stripe、hosted AI、monthly AI checks、top-up 和 account recovery。
- 新增 AI PM Review Workspace：把 AI Check 结果标注为 bad case，并转换成 eval case，用来展示 AI 产品经理的 review/eval 工作流。

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
2. 点击 `Dev Unlock Lifetime`。
3. 点击 `Use Demo Model`，无需真实 API Key 也能跑完整 AI Check demo。
4. 打开 Block page，启动 AI Track，输入用户理由，得到 structured decision。
5. 打开 AI PM Review Workspace，把不满意的结果标成 bad case。
6. 点击 `Convert to Eval Case`，把 bad case 沉淀为 eval set。

## 阅读方式

如果你想更舒服地阅读，请先打开 [README.html](README.html)。每一份 Markdown 文档旁边都有同名 `.html` 版本。

如果你要手写代码，建议按下面顺序读。

| 顺序 | 文档 | 用途 |
| --- | --- | --- |
| 1 | [Browser Extension Introduction](docs/00-browser-extension-introduction.html) | 如果你熟悉 Web/iOS，但不熟悉浏览器插件开发，先读这份。 |
| 2 | [产品 PRD](docs/01-product-prd.md) | 固定产品定位、用户分层、MVP scope 和核心用户流程。 |
| 3 | [决策记录](docs/02-decision-record.md) | 把已经拍板的规则集中放在一起，避免实现时反复犹豫。 |
| 4 | [Extension Architecture](docs/03-extension-architecture.md) | 解释 MV3、`background service worker`、React pages、storage、DNR 和 message passing。 |
| 5 | [Blocking and Routing Spec](docs/04-blocking-and-routing-spec.md) | 说明 domain block、exact URL block、redirect、cooldown、delay、temporary unlock 和 block hold。 |
| 6 | [AI Check Spec](docs/05-ai-check-spec.md) | 说明 AI Track 状态机、opening message、structured output 和 Pattern Memory。 |
| 7 | [LLM Provider Spec](docs/06-llm-provider-spec.md) | 说明 OpenAI、DeepSeek、Kimi 如何统一走 OpenAI-compatible Chat Completions。 |
| 8 | [Local Security and License Spec](docs/07-local-security-and-license.md) | 说明 API key 本地加密、License Mock 和未来 License Endpoint。 |
| 9 | [Implementation Roadmap](docs/08-implementation-roadmap.md) | 按手写代码顺序拆阶段。 |
| 10 | [API and Browser Reference](docs/09-api-and-browser-reference.md) | 代码实现时最常查的官方 API 链接。 |
| 11 | [Interview Learning Guide](docs/10-interview-learning-guide.md) | 把这个项目整理成 SDE Interview 能讲清楚的工程故事。 |
| 12 | [File and Function Blueprint](docs/11-file-function-blueprint.md) | 最贴近实现的一份：写哪些文件、每个文件有哪些函数、函数职责是什么。 |
| 13 | [AI PM MVP Playbook](docs/12-ai-pm-mvp-playbook.html) | 面向 AI 产品经理面试：如何讲 bad case、eval set、rubric 和产品闭环。 |

## 当前 Non-Goals

- 不做 mobile app。
- 不做 accountability partner。
- 不做 community。
- MVP 不做 cloud AI ledger。
- MVP 不接真实 Stripe。
- MVP 不接真实 License Endpoint。
- MVP 不接 Codex app-server。
- 不读取 full browser history。
- 不读取 page content。
- MVP 不在 UI 里展示 NSFW URL 列表。
