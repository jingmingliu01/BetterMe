# BetterMe 决策记录

这份文档是当前版本的 source of truth。实现时如果不确定，以这里为准。

## 1. Product Tier 决策

| Topic | Decision |
| --- | --- |
| Free blocked sites | 无限数量。 |
| Free AI Check | UI 完整存在，但 locked。 |
| Lifetime License | 解锁 AI Check、Pattern Memory、Advanced Strictness、Provider Config。 |
| Lifetime AI cost | 用户使用自己的 LLM API Key，费用由用户自己的 provider account 承担。 |
| MVP login | 不做 BetterMe login。 |
| MVP subscription | 不做 subscription。 |
| MVP license | 先做 local mock unlock。 |
| Future license endpoint | 默认支持 3 台设备。 |

## 2. Browser / Platform 决策

| Topic | Decision |
| --- | --- |
| Browser | MVP 只做 Chrome。 |
| Extension platform | Manifest V3。 |
| UI | React + TypeScript。 |
| Blocking mechanism | DNR redirect 到 extension block page。 |
| Blur overlay | 不做 MVP，未来可选。 |
| Cloud backend | MVP AI path 不走 BetterMe backend。 |
| Extension backend | 指 `background service worker`，运行在用户浏览器本地。 |

## 3. Blocking 决策

| Topic | Decision |
| --- | --- |
| Domain block | 阻断 domain 和所有 subdomains。 |
| Exact URL block | MVP 仅支持 exact URL，不支持 wildcard。 |
| Add current page default | 默认添加整个 domain。 |
| Add exact URL | 放在 Advanced/expand UI 中。 |
| Basic Cooldown | 默认 5 分钟。 |
| ALLOW duration | LLM 可以建议，但本地按 strictness cap clamp。默认 cap：Monk 5m、Strict 10m、Balanced 15m、Gentle 30m。 |
| DELAY behavior | 倒计时结束后继续同一个 track。 |
| BLOCK behavior | 阻断当前 target 到用户本地时间第二天 00:00。 |
| Temporary unlock | 本地保存 expiry。 |

## 4. AI Check 决策

| Topic | Decision |
| --- | --- |
| Opening message | 本地固定 assistant message，不调用 LLM。 |
| Opening template | `You're trying to open {displayTarget}. What are you here to do, and why now?` |
| Max assistant turns | 5 个 LLM assistant turns。 |
| Max duration | 10 分钟。 |
| Final decisions | `ALLOW`、`DELAY`、`ASK_MORE`、`BLOCK`。 |
| Structured output | 必须校验。 |
| Provider failure | AI panel 进入 unavailable/error state，不能自动放行。 |
| Invalid JSON | 自动 retry 一次；仍失败则 provider_error。 |

## 5. LLM Provider 决策

| Topic | Decision |
| --- | --- |
| Providers | OpenAI、DeepSeek、Kimi。 |
| Anthropic | 不做 MVP。 |
| API format | OpenAI-compatible Chat Completions。 |
| SDK | MVP 优先手写轻量 `fetch` client。 |
| Model UI | Provider dropdown + model dropdown。 |
| API Key | 用户提供，本地加密保存。 |

## 6. Privacy 决策

| Topic | Decision |
| --- | --- |
| Full browser history | 不读取。 |
| Page content | MVP 不读取。 |
| Blocked target storage | 只保存用户添加的 domain 或 exact URL。 |
| API key storage | 不以 plaintext 存在 `chrome.storage.local`。 |
| API key transport | 直接从 extension background 发给用户选择的 LLM provider，不发给 BetterMe。 |
| Data controls | 提供 export/delete local data。 |

## 7. NSFW Preset 决策

| Topic | Decision |
| --- | --- |
| NSFW preset | 可以作为 blocklist category。 |
| URL visibility | MVP 默认隐藏具体 URL。 |
| Default state | 默认关闭。 |
| User action | 用户必须主动 enable。 |
| Crawler | MVP 不实现 crawler。 |
| Store policy stance | 避免任何 listing、promotion、routing 到成人站点的 UI。 |

