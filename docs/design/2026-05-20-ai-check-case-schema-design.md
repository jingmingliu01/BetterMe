# 2026-05-20 AI Check Case Schema Design

Related docs:

- Progress: [2026-05-20-ai-check-case-schema-progress.md](2026-05-20-ai-check-case-schema-progress.md)
- Issues: [2026-05-20-ai-check-case-schema-issues.md](2026-05-20-ai-check-case-schema-issues.md)
- AI review/eval loop: [2026-05-18-ai-review-eval-loop-design.md](2026-05-18-ai-review-eval-loop-design.md)
- AI Check state machine: [2026-05-12-ai-check-session-state-machine-design.md](2026-05-12-ai-check-session-state-machine-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

BetterMe AI Check should treat every checkpoint as a structured product decision, not free-form chat.

The shared case shape should make three boundaries explicit:

```text
input  -> model-visible checkpoint context
output -> actual model answer
eval   -> PM/evaluator-only ground truth and assertions
```

This lets PM-authored boundary cases, real provider outputs, and manually reviewed bad cases live in one readable schema without leaking eval answers into the model prompt.

## Unified Case Shape

```ts
interface AICheckCase {
  id: string;
  title: string;
  source: "authored_eval" | "real_session" | "bad_case_review";
  versions: {
    promptVersion: string;
    schemaVersion: string;
    rubricVersion: string;
  };
  input: AICheckCaseInput;
  output?: AICheckCaseOutput;
  eval?: AICheckCaseEval;
}
```

`input` is the X value. It contains only data that may be shown to the model:

- `targetDisplay`
- `strictness`
- `sessionContext`
- `messages`
- `patternMemorySnapshot`

`output` is the actual model result. It contains provider metadata, raw provider JSON, and parsed decision fields.

`eval` is the PM/evaluator-only ground truth. It contains expected decision assertions, forbidden outputs, score ranges, tags, and reviewer notes.

## Category Families

There are two category families. They should not be merged.

Decision reason category explains why the current decision was made:

- `repeated_excuse`
- `clear_intention`
- `high_risk_pattern`
- `low_risk`
- `insufficient_reason`

Behavior reason category explains the user's underlying pattern for future memory:

- `stress`
- `boredom`
- `loneliness`
- `escape`
- `habit`
- `intentional`
- `other`

The old runtime field names remain `reasoningCategory` and `memoryUpdate.reasonCategory` for compatibility, but new schema and docs should describe them as `decisionReasonCategory` and `behaviorReasonCategory`.

## Mapping Rubric

The mapping rubric must be visible in both docs and the LLM system prompt.

- Intentional behavior with a specific purpose, time boundary, and exit plan usually maps to `clear_intention` and `ALLOW`.
- Boredom, stress, escape, loneliness, or habit without a time boundary usually maps to `insufficient_reason` and `ASK_MORE` or `AI_COOLDOWN`.
- Repeated boredom, escape, stress, or habit in relevant pattern memory usually maps to `repeated_excuse` and `AI_COOLDOWN` or `BLOCK`.
- Sensitive or explicit targets combined with impulsive, lonely, bored, or repeated behavior usually map to `high_risk_pattern` and `BLOCK` or `AI_COOLDOWN`.
- Same-session repetition alone is not long-term repetition unless relevant pattern memory supports it.

## Score Contract

`scores.repeatedReason`, `scores.impulse`, and `scores.deliberateness` are independent 0-100 ratings.

They are not percentages and do not need to sum to 100.

Validation behavior:

- Prompt must tell the model the score contract.
- Parser must reject missing, non-finite, or out-of-range scores.
- Provider client may attempt one repair retry with the validation error.
- If repair still fails, the session should remain a `schema_error`.

## Eval-Only Fields

The following fields must not be included in model-visible input:

- `eval.expectedOutput`
- `eval.allowedDecisions`
- `eval.disallowedDecisions`
- `eval.expectedScoreRanges`
- `eval.mustAskAbout`
- `eval.mustNotSay`
- `eval.tags`
- `eval.reviewerNote`

These fields are not notes only. They are machine-checkable assertions for the eval runner.

## Migration Strategy

The runner should support both legacy flat eval cases and the new `{ input, output?, eval }` shape during migration.

New bad-case conversions should write the new shape.

Built-in legacy fixtures may be migrated gradually after compatibility is proven.
