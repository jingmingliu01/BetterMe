# AI PM MVP Playbook

这份文档不是工程实现说明，而是面试时用来讲清楚 BetterMe MVP 的 AI Product Manager 工作流。

## 1. MVP 要证明什么

BetterMe 不是普通 blocker。它验证的是：

- 用户在高刺激网站前，是否愿意接受一个 AI checkpoint。
- AI 是否能把用户理由判断为 deliberate decision 或 impulsive escape。
- Product team 是否能从 bad case 中持续改进 prompt、rubric、memory 和 eval。

因此 MVP 不只要能聊天，还要能形成一个产品闭环：

```text
AI Check Track
  -> structured decision
  -> PM reviews failure
  -> bad case label
  -> eval case
  -> prompt / rubric improvement
  -> regression test
```

## 2. 什么是 Bad Case

Bad case 不是“回答看起来不好”。Bad case 必须能落到可验证标准。

BetterMe MVP 中的 bad case 类型：

- `wrong_decision`：模型给了错误 decision，例如应该 `DELAY` 却 `ALLOW`。
- `weak_challenge`：用户理由很弱，但 AI 没有继续追问。
- `schema_issue`：输出不是合法 JSON，或字段缺失。
- `tone_issue`：语气羞辱、说教、过度道德评判。
- `memory_miss`：用户重复之前的借口，但 AI 没有识别。
- `policy_risk`：输出涉及不应该生成的内容，或者引导用户继续高风险行为。

面试表达：

> I define a bad case as a model behavior that violates an explicit product rubric, safety boundary, or structured output contract. I do not label based on taste; I label based on user impact and reproducible criteria.

## 3. Bad Case 如何变成 Eval Case

一个 eval case 应该包含：

- 原始用户上下文。
- 目标网站。
- 历史 memory 摘要。
- 用户当前理由。
- 期望 decision。
- 至少一个 assertion。

例子：

```text
Input:
User is trying to visit youtube.com.
User says: "I just want to relax for a bit."
Pattern memory says boredom is a repeated reason.

Expected:
Decision should be DELAY or BLOCK.

Assertion:
The model must not return ALLOW when the reason is vague and repeated.
```

## 4. 面试时如何讲这个产品

推荐 60 秒版本：

> BetterMe is a privacy-first Chrome extension for self-control around user-defined high-dopamine websites. The user can always leave for free, but if they want to continue, they enter a bounded AI Check. The AI returns a structured decision: ALLOW, DELAY, ASK_MORE, or BLOCK. The important AI PM piece is that every track can be reviewed as a bad case. I classify failures by decision error, weak challenge, schema issue, tone issue, memory miss, or policy risk, then convert them into eval cases. This gives the product a measurable improvement loop rather than treating prompt quality as subjective.

## 5. 当前 MVP 支持的面试演示

你可以现场展示：

1. 添加 blocked site。
2. 使用 Dev Lifetime Unlock 和 Demo Model。
3. 访问 Block page，开始 AI Track。
4. 输入一个清晰理由，看到 `ALLOW`。
5. 进入 AI PM Review Workspace。
6. 把这次 `ALLOW` 标成 bad case，例如“缺少 exit mechanism”。
7. 转换成 eval case。
8. 解释下一步会用这个 eval set 防止 prompt regression。

## 6. 下一步产品化

真正上线前，应该补：

- Eval runner：批量跑 eval cases，对比 expected decision。
- Prompt versioning：记录每个 eval case 是在哪个 prompt version 下失败。
- Review queue filters：按 severity、bad case type、target category 过滤。
- Cloud sync：把匿名本地 eval 数据变成可选上传，供产品迭代分析。
- Human review policy：定义哪些 case 需要人工 review，哪些可以自动归类。
