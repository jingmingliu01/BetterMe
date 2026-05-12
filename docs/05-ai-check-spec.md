# AI Check 规格

## 1. 目标

AI Check 是一个 bounded AI-guided checkpoint。用户尝试说服 AI：自己访问 blocked target 是 deliberate decision，不是 impulsive escape。

AI Check 必须：

- 有明确边界。
- Non-shaming。
- 能通过 Pattern Memory 挑战重复借口。
- 返回 structured decision。
- 由 extension 本地执行最终规则。

## 2. 可用条件

AI Check 可用的前提：

- Lifetime License 已 unlock。
- Provider 已选择。
- API Key 已保存且可解密。
- Model 已选择。
- 当前 target 没有 active block hold。

如果不可用：

- Chatbot panel 仍然显示。
- 输入框 disabled。
- 显示具体原因。
- 左侧按钮仍然可用。

## 3. Opening Message

当 license 和 key 都 ready 时，第一句 assistant message 本地生成，不调用 LLM。

Template：

```text
You're trying to open {displayTarget}. What are you here to do, and why now?
```

规则：

- `{displayTarget}` 必须替换成真实 normalized target。
- 这条 message 作为 assistant message 存入当前 track。
- 后续调用 LLM 时包含在 context 中。
- 不算 LLM assistant turn。

## 4. Track Limits

默认限制：

- 最多 5 个 LLM assistant turns。
- 最多 10 分钟。
- 一个最终 enforceable decision。

`ASK_MORE` 算一个 LLM assistant turn。

本地 opening message 不算。

## 5. Decision Types

### ALLOW

效果：

- 创建 temporary unlock。
- LLM 可以建议 `unlockMinutes`。
- Extension 按 strictness cap clamp。

默认 cap：

- Gentle：30 分钟。
- Balanced：15 分钟。
- Strict：10 分钟。
- Monk：5 分钟。

### DELAY

效果：

- 显示 delay timer。
- Target 继续被阻断。
- 倒计时结束后，用户在同一个 track 继续聊。

### ASK_MORE

效果：

- AI 问一个额外问题。
- 不启动 timer。
- 同一个 track 继续。

### BLOCK

效果：

- 阻断到本地时间第二天 00:00。
- 同一个 target 在 block hold 期间不能开启新 AI Track。
- 用户仍可 `Leave Site`。

## 6. Track State Machine

```text
locked
  -> unavailable

ready
  -> active

active
  -> ask_more
  -> delayed
  -> allowed
  -> blocked
  -> expired
  -> provider_error

delayed
  -> active

allowed
  -> completed

blocked
  -> completed

expired
  -> completed
```

实现建议：

- 不要把状态散落在 React component 里。
- 用 `ai-track-state.ts` 集中处理 transition。
- UI 只根据 state render。

## 7. Data Model

```ts
type AIDecision = "ALLOW" | "DELAY" | "ASK_MORE" | "BLOCK";

interface AITrack {
  id: string;
  targetId: string;
  targetDisplay: string;
  status:
    | "active"
    | "delayed"
    | "allowed"
    | "blocked"
    | "expired"
    | "provider_error"
    | "completed";
  startedAt: string;
  expiresAt: string;
  completedAt?: string;
  assistantTurnCount: number;
  maxAssistantTurns: number;
  finalDecision?: AIDecision;
}

interface AITrackMessage {
  id: string;
  trackId: string;
  role: "system" | "assistant" | "user";
  content: string;
  source: "local_opening" | "user" | "llm";
  createdAt: string;
}
```

## 8. Structured Output Schema

```ts
interface CheckpointDecision {
  decision: "ALLOW" | "DELAY" | "ASK_MORE" | "BLOCK";
  userFacingMessage: string;
  reasoningCategory:
    | "repeated_excuse"
    | "clear_intention"
    | "high_risk_pattern"
    | "low_risk"
    | "insufficient_reason";
  unlockMinutes: number | null;
  delaySeconds: number | null;
  nextQuestion: string | null;
  scores: {
    repeatedReason: number;
    impulse: number;
    deliberateness: number;
  };
  memoryUpdate: {
    reasonCategory:
      | "stress"
      | "boredom"
      | "loneliness"
      | "escape"
      | "habit"
      | "intentional"
      | "other";
    patternNote: string | null;
  };
}
```

Validation rules：

- `decision` 必须存在。
- `userFacingMessage` 必须存在。
- `ALLOW` 必须有 `unlockMinutes`。
- `DELAY` 必须有 `delaySeconds`。
- `ASK_MORE` 必须有 `nextQuestion`。
- scores 必须是 0 到 1。
- invalid JSON retry 一次。
- 第二次仍失败进入 `provider_error`。

## 9. Context Layers

不要把所有 raw history 都塞进 LLM context。

每次调用 LLM 时，构造：

1. Gate Constitution。
2. User Profile。
3. Pattern Memory。
4. Recent Track Summaries。
5. Current Track Messages。

### Gate Constitution

稳定规则：

- Non-shaming tone。
- No explicit sexual content generation。
- No moral judgment。
- Focus on deliberate vs impulsive decision。
- Challenge repeated excuses。
- Respect strictness。
- Return JSON only。

### User Profile

包含：

- Strictness。
- Goals。
- Preferred tone。
- Max turns。

### Pattern Memory

包含：

- Common repeated reasons。
- High-risk time windows。
- Recurring impulse patterns。
- AI guidance for future sessions。

### Recent Track Summaries

只放摘要，不放完整 raw transcripts。

### Current Track

包含：

- Current target。
- Local time。
- Opening message。
- Current conversation messages。

## 10. Provider Error

| Error | UI behavior |
| --- | --- |
| License locked | Chat panel locked。 |
| API key missing | 显示 setup prompt。 |
| API key invalid | 显示 invalid key，并链接到 settings。 |
| Provider quota/rate limit | 显示 provider error，保持阻断。 |
| Network failure | 显示 retry。 |
| Invalid model output | retry 一次后显示 invalid response。 |

Provider error 永远不能自动放行。

## 11. Track Summary

完成时保存：

```ts
interface AITrackSummary {
  id: string;
  trackId: string;
  targetDisplay: string;
  decision: AIDecision;
  reasonCategory: string;
  summary: string;
  createdAt: string;
}
```

MVP 可以用 LLM response 里的 `memoryUpdate` 和最后几条 messages 生成简单 summary。

## 12. Pattern Memory Update

更新时机：

- 检测到 repeated reason。
- 出现 high-risk time window。
- 某 reasonCategory 高频出现。
- AI 因 repeated excuse 返回 `DELAY` 或 `BLOCK`。
