# 阻断与路由规格 Blocking and Routing Spec

## 1. 目标

Blocking system 必须：

- Privacy-first。
- 不读取 page content。
- 不读取 full browser history。
- 稳定阻断用户定义的 target。
- Redirect 到 BetterMe Block Page。
- 支持 temporary unlock、cooldown、delay、block hold。

## 2. Target Types

### 2.1 Domain Target

用户输入：

```text
youtube.com
https://youtube.com
https://www.youtube.com/watch?v=abc
```

如果用户选择 domain blocking，normalize 成：

```ts
interface DomainTarget {
  type: "domain";
  domain: "youtube.com";
  includeSubdomains: true;
}
```

匹配：

- `youtube.com`
- `www.youtube.com`
- `m.youtube.com`
- `music.youtube.com`

不匹配：

- `notyoutube.com`
- `youtube.com.example.com`

### 2.2 Exact URL Target

用户输入：

```text
https://www.youtube.com/shorts/abc123
```

如果用户选择 exact URL blocking，normalize 成：

```ts
interface ExactUrlTarget {
  type: "exactUrl";
  url: "https://www.youtube.com/shorts/abc123";
}
```

MVP 规则：

- Exact only。
- 不支持 wildcard。
- 不支持 path prefix。
- Query params 默认保留。

## 3. Add Current Page UI

默认 UI：

```text
Block this site
[Add youtube.com and subdomains]
```

Advanced 展开后：

```text
Advanced
[Only block this exact URL]
```

原因：

- 大多数用户想阻断整个 domain。
- Exact URL 是小众需求，不应该干扰默认流程。

## 4. DNR Redirect

使用 `chrome.declarativeNetRequest` dynamic rules，把匹配的 main-frame request redirect 到：

```text
chrome-extension://{extensionId}/block.html?targetId={targetId}&url={encodedOriginalUrl}
```

Block Page 显示 normalized target：

- Domain：`youtube.com`
- Exact URL：`youtube.com/shorts/abc123`

不要默认展示很长的 tracking query。

官方文档：

- [chrome.declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)

## 5. Temporary Unlock

当 AI decision 是 `ALLOW`，创建 temporary unlock。

```ts
interface TemporaryUnlock {
  id: string;
  targetId: string;
  targetType: "domain" | "exactUrl";
  normalizedTarget: string;
  createdAt: string;
  expiresAt: string;
  sourceTrackId: string;
}
```

行为：

- unlock 期间 target 可以访问。
- 到期后自动恢复阻断。
- 浏览器重启后，只要没过期仍然有效。

实现选项：

1. 暂时 remove/disable 对应 DNR rule，到期 restore。
2. 添加 higher-priority allow rule。

MVP 可以先选更简单、可测试的实现。

## 6. Basic Cooldown

Basic Cooldown 是一个免费、非 AI 的冷静倒计时。

默认：

- 5 分钟。

流程：

1. 用户点击 `Start Cooldown`。
2. Block Page 显示 5 分钟 countdown。
3. Target 继续被阻断。
4. 倒计时结束后，用户可以继续选择：
   - `Leave Site`
   - `Start AI Check`
   - 再来一次 cooldown

Basic Cooldown 不会：

- 调用 LLM。
- 要求 license。
- 创建 AI Track。
- 更新 Pattern Memory。

## 7. Delay Timer

Delay Timer 是状态，不是单独功能。

来源：

- 用户主动开始 Basic Cooldown。
- AI decision 返回 `DELAY`。

如果来自 AI `DELAY`：

- 保持同一个 AI Track。
- 等待 `delaySeconds`。
- 倒计时结束后，用户可以继续在同一个 track 里聊天。
- 不创建新 track。

## 8. BLOCK Until Next Day

当 AI decision 是 `BLOCK`，BetterMe 阻断当前 target 到用户本地时间第二天 00:00。

例子：

- 当前本地时间：2026-05-10 21:15。
- block expiry：2026-05-11 00:00 local time。

数据：

```ts
interface BlockHold {
  id: string;
  targetId: string;
  sourceTrackId: string;
  createdAt: string;
  expiresAt: string;
  reason: "ai_block_until_next_day";
}
```

Block hold 期间：

- 同一个 target 不能开始新的 AI Track。
- UI 显示剩余时间。
- 用户仍然可以 `Leave Site`。

## 9. Leave Site / Close Tab

主逃离按钮必须免费、明显。

推荐 label：

- 如果实现是关闭 tab：`Close Tab`。
- 如果实现是跳转离开：`Leave Site`。

不要用：

- `Close to Live`，英文不自然。

## 10. Block Page Layout

```text
----------------------------------------------------
| Left action area       | Right AI Check area       |
| target                 | opening message           |
| status                 | conversation              |
| Leave Site / Close Tab | input box                 |
| Start Cooldown         | turns/time remaining      |
| Settings               | final decision            |
----------------------------------------------------
```

Free 状态：

- 右侧 AI Check visible but locked。
- 显示为什么 locked。
- 显示 Lifetime unlock entry。

Lifetime BYOK 状态：

- key ready：显示本地 opening message。
- key missing：显示 provider setup prompt。

## 11. Edge Cases

| Case | Expected behavior |
| --- | --- |
| 用户删除当前 target | 显示 target no longer blocked，并提供 settings/home。 |
| unlock 过期 | 下一次 navigation 重新 blocked。 |
| DNR rule update 失败 | 显示错误，保留旧 rules。 |
| exact URL 有 query | MVP exact match，UI 要说明。 |
| invalid domain | 拒绝并显示 validation error。 |
| unsupported protocol | MVP 只支持 `http` 和 `https`。 |
