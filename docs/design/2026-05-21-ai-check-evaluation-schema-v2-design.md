# 2026-05-21 AI Check Evaluation Schema V2 Design

Related docs:

- Progress: [2026-05-21-ai-check-evaluation-schema-v2-progress.md](2026-05-21-ai-check-evaluation-schema-v2-progress.md)
- Issues: [2026-05-21-ai-check-evaluation-schema-v2-issues.md](2026-05-21-ai-check-evaluation-schema-v2-issues.md)
- Contract version boundaries: [2026-05-21-ai-check-contract-version-boundaries-design.md](2026-05-21-ai-check-contract-version-boundaries-design.md)
- AI Check case schema: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- PM Review workspace: [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

Evaluation Cases should capture PM expectations for a bad or important AI Check case in a structure that can be automatically re-run after prompt, model, provider, or schema changes.

The current evaluation fields are useful but too flat:

- `mustAskAbout`
- `mustNotSay`
- `expectedScoreRanges`
- `expectedCooldownRangeSeconds`
- `expectedOutput.behaviorReasonCategory`

Those fields describe expectations about output fields, but they are not organized as an output-shaped evaluation mirror. Evaluation Schema V2 makes `eval.expectedOutput` mirror the model Output Schema so each expectation is attached to the output field it evaluates.

## Case Envelope

Evaluation Case remains:

```ts
interface AICheckCase {
  versions: {
    promptVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
  };
  input: AICheckCaseInput;
  output?: AICheckCaseOutput;
  eval: AICheckCaseEval;
}
```

`input` reconstructs the provider request with `promptVersion`. `output` stores a captured actual provider output when available. `eval` stores PM expectations for automated regression judging.

## Expected Output Mirror

Evaluation Schema V2 uses:

```ts
interface AICheckCaseEval {
  expectedOutput: ExpectedCheckpointDecisionOutput;
  tags: string[];
  reviewerNote?: string;
}
```

`ExpectedCheckpointDecisionOutput` mirrors the model output contract:

```ts
interface ExpectedCheckpointDecisionOutput {
  decision?: AIDecision;
  userFacingMessage?: TextExpectation;
  decisionReasonCategory?: DecisionReasonCategory;
  unlockMinutes?: NullableNumberExpectation;
  aiCooldownSeconds?: NullableNumberExpectation;
  scores?: Partial<Record<AICheckScoreName, NumberRangeExpectation>>;
  memoryUpdate?: {
    behaviorReasonCategory?: BehaviorReasonCategory;
    patternNote?: NullableTextExpectation;
  };
}
```

If a field is omitted, EvaluationRunner does not compare that field.

## Field Semantics

Decision:

- exact enum match when present.

User-facing message:

- `mustMention`: every phrase or topic must appear case-insensitively.
- `mustNotMention`: no phrase may appear case-insensitively.

Decision reason category:

- exact enum match when present.

Unlock minutes and AI cooldown seconds:

- `exact`: exact value, including `null` when needed.
- `min` and `max`: numeric range when exact is not sufficient.

Scores:

- `min` and `max` per score.
- omitted scores are not compared.

Memory update:

- `behaviorReasonCategory`: exact enum match.
- `patternNote`: `exact`, `mustMention`, and `mustNotMention`; omitted means no comparison.

## Runner Behavior

EvaluationRunner compares the actual parsed model output against `eval.expectedOutput`.

Failure reasons should include the output field path:

- `decision expected ASK_MORE, got ALLOW`
- `userFacingMessage missing required phrase: time limit`
- `scores.impulse 92 above max 80`
- `memoryUpdate.behaviorReasonCategory expected boredom, got habit`

This keeps PM Review failures actionable and avoids a second generic assertion namespace.

## PM Review Behavior

PM Review should write expectations into the output-shaped fields:

- expected decision.
- user-facing message must/must-not mention lists.
- reason category expectations.
- unlock/cooldown exact or range expectations.
- score ranges.
- memory update expectations.
- tags and reviewer notes.

The UI can still present simple controls, but stored data should follow `eval.expectedOutput`.

## Versioning

This schema is `ai-check-evaluation-v2`.

Changing field names, expectation semantics, or EvaluationRunner interpretation for an existing expectation field requires a new `evaluationSchemaVersion`.

Historical version registry and manual version switching are tracked as a later phase. This slice keeps the current single contract while making the current evaluation schema coherent.
