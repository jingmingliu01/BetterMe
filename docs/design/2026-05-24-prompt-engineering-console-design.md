# 2026-05-24 Prompt Engineering Console Design

Related docs:

- Progress: [2026-05-24-prompt-engineering-console-progress.md](2026-05-24-prompt-engineering-console-progress.md)
- Issues: [2026-05-24-prompt-engineering-console-issues.md](2026-05-24-prompt-engineering-console-issues.md)
- PM Review workspace: [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md)
- AI Check case schema: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- AI Check provider message contract: [2026-05-21-ai-check-provider-message-contract-design.md](2026-05-21-ai-check-provider-message-contract-design.md)
- AI Check contract SSOT: [2026-05-22-ai-check-contract-ssot-design.md](2026-05-22-ai-check-contract-ssot-design.md)

External reference:

- Prompt Engineering scientific AI PM article: [Prompt Engineering 科学化探索](https://jingmingliu01.github.io/To-be-a-better-PM/articles/prompt-engineering-scientific-ai-pm.html)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

BetterMe AI Check should evolve from a local PM Review workspace into a scientific Prompt Engineering Console.

The console should help a PM and developer improve AI behavior through a repeatable loop:

```text
Product goal
  -> AI decision policy
  -> Prompt Program
  -> Decision Point capture
  -> PM Review
  -> Evaluation Case
  -> Dataset split
  -> Experiment Run
  -> Release Decision
  -> online bad case feedback
```

The goal is not to make prompt editing feel like writing better copy. The goal is to treat the prompt, policy, schema, validator, examples, and eval set as one testable decision program.

## Non-Goals

- Do not preserve old local PM Review data as a design constraint. The current product has no meaningful legacy PM Review dataset, so the ideal model can be introduced directly when implemented.
- Do not introduce cloud sync or remote reviewer workflows in this design. BetterMe remains privacy-first and local-first.
- Do not make automatic prompt optimization the first implementation slice.
- Do not treat whole AI Check sessions as the default eval unit. The default eval unit is a decision point.

## Core Product Model

### Prompt Program

Prompt Program is the full AI decision program, not just one system prompt string.

It includes:

- system role and static instructions.
- decision policy.
- reason-strength and risk rubrics.
- provider message ordering.
- input schema.
- output schema.
- evaluation schema.
- few-shot examples when introduced.
- parser, validator, repair, and fallback behavior.
- provider/model constraints when they affect reproducibility.

Current implementation anchors:

- `apps/extension/src/ai/prompt.ts`
- `apps/extension/src/ai/context-builder.ts`
- `apps/extension/src/ai/checkpoint-schema.ts`
- `apps/extension/src/shared/ai-check-contract.json`
- `apps/extension/src/shared/provider-config.json`

`promptVersion` should eventually become `promptProgramVersion`, or should be documented as the version of the full Prompt Program rather than only static prompt text.

### Session

Session is a real AI Check round created by user behavior.

It contains the target, strictness, max turns, round snapshot, messages, and decisions. Sessions are evidence, not directly editable eval fixtures.

### Decision Point

Decision Point is the primary unit of review and evaluation.

A decision point is one provider decision opportunity:

```text
round snapshot
  + conversation visible before the model response
  + turn context
  -> provider request
  -> model output
  -> parsed stored decision
```

One AI Check session can contain multiple decision points. PM Review must let the reviewer select the exact decision point that failed.

When a PM selects turn N for review, future turns after turn N must not enter the generated eval input. Future turns can remain in lineage/audit context, but not in the replayable case input.

### Review

Review is PM judgment on a selected decision point.

Review should capture:

- selected decision point.
- actual decision.
- expected decision.
- error types.
- severity.
- reviewer rationale.
- whether to convert to eval.

`BadCaseReview` remains a review artifact. It should not be used as a case source category.

### Evaluation Case

Evaluation Case is a replayable decision-point test.

The default rule is:

```text
one Evaluation Case = one Decision Point
```

An eval case must contain:

- input context visible at that decision point.
- optional actual output captured from the reviewed decision.
- expected output assertions.
- tags and reviewer rationale.
- lifecycle status.
- dataset type.
- provenance.
- optional lineage.

The case input must not include future user messages or future assistant outputs after the reviewed decision point.

### Dataset Type

Dataset type defines why a case is used in experiments.

It is separate from lifecycle status.

```ts
type AICheckCaseStatus = "draft" | "ready" | "archived";
type AICheckDatasetType = "design" | "regression" | "holdout";
```

Status answers: is this case ready for use?

Dataset type answers: how should this case be used in prompt engineering?

- `design`: PM-authored coverage for intended product behavior and main paths.
- `regression`: prior failures and release-gating cases that must not regress.
- `holdout`: hidden or limited-visibility cases used for final generalization checks.

Holdout visibility rule:

- `tuning` mode can run Holdout cases but should show aggregate metrics and release-gate status only.
- `release_review` mode can show controlled Holdout failure summaries when the PM is making a release decision.
- Routine prompt tuning should not expose Holdout case titles, tags, or failure reasons.

Implementation has started with `status = "regression"` replaced by `datasetType = "regression"` in the evaluation schema and built-in fixtures. Because legacy data is not a constraint, this remains a direct model cleanup instead of a compatibility migration.

### Provenance and Lineage

Replace source semantics with provenance and optional lineage.

`provenance` is required and tells where the case came from:

```ts
type AICheckCaseProvenance =
  | { type: "authored"; author?: string }
  | { type: "session"; sessionId: string; decisionId: string }
  | { type: "review"; reviewId: string; sessionId: string; decisionId: string };
```

`lineage` is optional and only describes case-to-case derivation:

```ts
interface AICheckCaseLineage {
  parentCaseId?: string;
  supersedesCaseIds?: string[];
  splitFromCaseId?: string;
  mergedFromCaseIds?: string[];
}
```

Do not keep `bad_case_review` as a case source. It is represented by `provenance.type = "review"`.

### Experiment Run

Experiment Run is a reproducible offline run of one or more Prompt Program arms against a dataset selection.

First implementation should support the current Prompt Program only. Candidate Prompt A/B is intentionally second step scope.

Minimum run inputs:

- run mode: tuning or release review.
- prompt program version.
- provider.
- model.
- dataset type.
- filters: tags, strictness, expected decision, severity.
- case ids.

Minimum run outputs:

- pass/fail per case.
- actual decision.
- failure reasons.
- raw provider output when available.
- metrics summary.

CLI and PM Review should share the same run artifact shape:

```ts
interface AICheckEvalRunSummary {
  run: AICheckEvalRun;
  results: AICheckEvalResult[];
}
```

The CLI runner may write this artifact to disk for reproducible local or provider-mode runs. PM Review may import the artifact into local `evalRuns` and `evalResults` so the PM can inspect the same metrics, run history, release gate, and release decision workflow used by in-product runs.

Minimum metrics:

- total cases.
- pass rate.
- pass rate by tag.
- pass rate by strictness.
- false allow failures.
- false block failures.
- ASK_MORE recall failures.
- schema/format failures.
- unsafe sensitive failures.
- reason-quality failures.

### Release Decision

Release Decision is the final gate for changing the active Prompt Program.

AI_COOLDOWN is a terminal product decision for release-gating semantics. If the model returns `AI_COOLDOWN`, that decision point is complete and the eval should not expect later turns in the same round.

First implementation stores a release decision against one Experiment Run. It records approve/block, prompt/schema versions, provider/model, release gate status, gate reasons, metrics snapshot, PM note, and timestamp. Until Candidate Prompt A/B exists, approval means "the current Prompt Program is accepted for this run's selected dataset and provider context," not that a new prompt artifact has been promoted.

Default release gate:

- Design dataset passes threshold.
- Regression dataset has zero critical failures.
- Holdout dataset does not show material degradation.
- Schema validity is 100%.
- False allow failures are zero for critical cases.
- Unsafe sensitive failures are zero.
- Candidate does not regress against current Prompt Program on release-gating cases.

## Information Architecture

The final console should have these primary areas:

```text
Review
Case Library
Experiment Lab
Contract Reference
```

`Release Gate` should not be a top-level area in the first implementation. It should start as a result section inside Experiment Lab. Promote it later only if release decisions become frequent and rich enough to need their own workspace.

### Review

Review replaces session-level History review with decision-point review.

It should show:

- recent sessions.
- each session's decision-point timeline.
- target, strictness, provider/model, prompt program version.
- each decision's actual output and stored record.
- a PM review form attached to the selected decision point.

Required interaction:

```text
select session
  -> select decision point
  -> inspect input/output
  -> mark expected decision and failure type
  -> save review
  -> convert selected decision point to eval case
```

### Case Library

Case Library manages replayable eval cases and dataset membership.

It should not include raw History Sessions as editable cases. Real sessions enter Case Library only after conversion into Evaluation Cases.

Primary filters:

- dataset type.
- lifecycle status.
- provenance.
- failure type.
- content domain.
- intent/use-case domain.
- language.
- policy dimension.
- strictness.
- expected decision.
- prompt program version.

Recommended tag taxonomy:

- Content domain: `nsfw`, `social`, `video`.
- Intent/use-case domain: `work`, `school`.
- Language/locale: `zh`.
- Failure type: `over_allow`, `over_block`, `under_ask`, `unnecessary_ask`, `wrong_reason_strength`, `wrong_cooldown_duration`, `bad_tone`, `schema_or_format_failure`, `unsafe_sensitive_advice`.
- Policy dimension: `strictness`, `final_turn`, `repeated_pattern`, `cooldown_duration`, `unlock_cap`, `ask_more_threshold`.

### Experiment Lab

Experiment Lab should make running prompt experiments direct and repeatable.

First implementation scope:

- select current Prompt Program.
- select provider/model.
- select dataset type and filters.
- run eval.
- store run/results locally.
- show metrics and failures.
- show release gate summary.

Provider/model selection uses the same BYOK provider configuration and runtime provider-message builder as AI Check. Mock mode remains the default for fast daily tuning; provider mode is used when the PM wants to validate actual model behavior with a saved local provider key.

Second implementation scope:

- Candidate Prompt A/B.
- current vs candidate comparison.
- Textual Gradient failure diagnosis.
- candidate prompt/rubric/schema suggestions.
- experiment notes and rationale.

Phase 4 first slice uses separate product-layer artifacts instead of changing the evaluation case or eval run contract:

```ts
interface AICheckPromptCandidate {
  id: string;
  name: string;
  status: "draft" | "archived";
  instructionPatch: string;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
}

interface AICheckPromptComparison {
  id: string;
  candidateId: string;
  baselineRunId: string;
  candidateRunId: string;
  improvedCaseIds: string[];
  regressedCaseIds: string[];
  recommendation: "promote_candidate" | "revise_candidate" | "reject_candidate";
  promotionGate: {
    status: "pass" | "fail";
    datasetCoverage: Array<{
      datasetType: "design" | "regression" | "holdout";
      total: number;
      passed: number;
    }>;
    reasons: string[];
  };
  textualGradient: AICheckTextualGradient;
  createdAt: string;
}

interface AICheckPromptPromotion {
  id: string;
  candidateId: string;
  comparisonId: string;
  promptVersion: string;
  baselineRunId: string;
  candidateRunId: string;
  instructionPatch: string;
  note?: string;
  createdAt: string;
}

interface AICheckPromptProgramSuggestion {
  id: string;
  comparisonId: string;
  provider: "openai" | "deepseek" | "kimi";
  model: string;
  items: Array<{
    id: string;
    kind: "prompt_patch" | "rubric" | "schema";
    status: "proposed" | "accepted" | "rejected";
    title: string;
    suggestion: string;
    rationale?: string;
    implementationNotes?: string;
    risk?: string;
    reviewNote?: string;
    reviewedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

The baseline run and candidate run both remain standard `AICheckEvalRun` rows. The comparison artifact binds them together. Candidate runs append the candidate patch to the static system prompt inside a `<candidate_prompt_patch>` block, while preserving the normal trusted Round Context, Conversation, and Turn Context order.

Textual Gradient is diagnosis only. It can summarize failure clusters and suggested prompt directions, ask a saved BYOK provider to draft a new prompt candidate, and generate richer Prompt Program suggestions across prompt patch, rubric, and schema/evaluation gaps. Generated Prompt Candidates are saved as ordinary draft Prompt Candidates; they still require A/B comparison and promotion gates before they can affect runtime. Prompt Program Suggestions are separate PM artifacts and never mutate the prompt, schema, rubric, or release state by themselves. PM can mark suggestion items as accepted or rejected; accepted items become tracked inputs for a contract-first implementation workflow, not automatic schema or prompt edits.

Accepted Prompt Program Suggestions can produce a `ContractChangePlan` artifact. This artifact is an auditable implementation plan, not a runtime mutation. It references the accepted suggestion item, records target areas such as prompt, rubric, schema, or evaluation, and lists the surfaces that must change together: `ai-check-contract.json`, generated references, eval assertions or fixtures, and linked docs. A plan can be `draft`, `ready`, `applied`, or `rejected`, but `applied` is only valid after the corresponding source-code contract change has been made and validated through the normal gates. Marking a plan as applied requires an implementation note and records the prompt, output schema, and evaluation schema versions that were current at the handoff.

The Prompt Program rubric lives in `ai-check-contract.json` under `promptProgram`. Decision policy rules and scoring rules are generated into TypeScript constants, injected into the provider system prompt, and shown in Contract Reference. This makes rubric/policy changes source-controlled contract changes instead of hidden `prompt.ts` edits.

Evaluation schema changes follow the same contract-first rule. `ai-check-evaluation-v4` adds `eval.expectedInputEvidence` so a case can assert whether the replayed user messages contain explicit duration evidence and a return-task plan. These assertions are checked by both the shared eval engine and CLI runner before the model-output assertions are considered passing.

Promotion is a separate audited step. A candidate can become the active local Prompt Program only when a comparison recommends promotion, has no regressed cases, the candidate run does not fail the release gate, and Design, Regression, and Holdout coverage are all present and passing. Promotion records the candidate patch as a local active prompt version. New AI Check sessions freeze that promoted version and use its patch in provider messages.

### Contract Reference

Contract Reference continues the current Schema Reference role, but the name should communicate that it covers the whole Prompt Program contract.

It should show:

- accepted Prompt Program Suggestions as a contract-first backlog.
- Contract Change Plans created from accepted suggestions.
- provider messages.
- prompt program rubric and scoring rules.
- input schema.
- output schema.
- evaluation schema.
- current versions.
- prompt program policy/rubric references.

It must remain generated from shared contract/runtime builders where possible.

The accepted-suggestion backlog is an implementation queue, not a patch applier. Each item should remind the PM/engineer to update `ai-check-contract.json` first, regenerate derived contract references, update eval assertions or fixtures, and then refresh linked design/progress/issues docs.

## Runtime and Data Model Requirements

### Decision Point Snapshot

Runtime should persist or be able to deterministically build a decision-point snapshot.

Recommended shape:

```ts
interface AICheckDecisionPointSnapshot {
  id: string;
  sessionId: string;
  decisionId: string;
  triggeringUserMessageId: string;
  selectedAssistantMessageId?: string;
  nextAssistantTurn: number;
  assistantTurnCountBeforeDecision: number;
  maxAssistantTurns: number;
  isFinalTurn: boolean;
  roundSnapshot: AICheckRoundSnapshot;
  input: AICheckCaseInput;
  actualOutput?: AICheckCaseOutput;
  createdAt: string;
}
```

The snapshot must use the original round snapshot. It must not reload current pattern memory during conversion.

### Evaluation Case Shape

Recommended future shape:

```ts
interface AICheckCase {
  id: string;
  title: string;
  datasetType: "design" | "regression" | "holdout";
  provenance: AICheckCaseProvenance;
  lineage?: AICheckCaseLineage;
  versions: {
    promptProgramVersion: string;
    outputSchemaVersion: string;
    evaluationSchemaVersion: string;
  };
  input: AICheckCaseInput;
  output?: AICheckCaseOutput;
  eval: AICheckCaseEval;
  status: "draft" | "ready" | "archived";
  severity?: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archivedReason?: string;
}
```

### Experiment Shape

First implementation:

```ts
interface AICheckExperimentRun {
  id: string;
  mode: "tuning" | "release_review";
  promptProgramVersion: string;
  outputSchemaVersion: string;
  evaluationSchemaVersion: string;
  provider: "mock" | "openai" | "deepseek" | "kimi";
  model: string;
  datasetType: "design" | "regression" | "holdout";
  filters: {
    tags?: string[];
    strictness?: StrictnessLevel[];
    expectedDecisions?: AIDecision[];
    severity?: string[];
  };
  caseIds: string[];
  metrics: AICheckEvalMetrics;
  createdAt: string;
}
```

Second implementation:

```ts
interface AICheckExperiment {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  arms: Array<{
    id: string;
    name: string;
    kind: "baseline" | "current_prompt" | "candidate_prompt" | "variant";
    promptCandidateId?: string;
    runId?: string;
    notes?: string;
    createdAt: string;
  }>;
  artifactIds: {
    runIds: string[];
    comparisonIds: string[];
    suggestionIds: string[];
    releaseDecisionIds: string[];
    promotionIds: string[];
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

The implemented Phase 4 slice uses `AICheckExperiment` as a named workspace with explicit arm definitions plus links to existing run, comparison, suggestion, release decision, and promotion artifacts. It does not replace those artifacts or duplicate their data. Arms document the PM's experimental design; linked artifacts remain the authoritative evidence.

## Implementation Phases

### Phase 1: Decision-Point Review Foundation

- Treat Evaluation Case as one decision point.
- Update Review UI to select a specific decision point.
- Split Model Output from Stored Decision Record.
- Convert selected decision point to eval without future turns.
- Treat `AI_COOLDOWN` as terminal in product semantics and docs.
- Capture actual output in converted eval case.

### Phase 2: Ideal Case Model and Dataset Split

- Update AI Check evaluation schema to include `datasetType`, `provenance`, and optional `lineage`.
- Remove `bad_case_review` from source semantics.
- Replace `status = regression` with `datasetType = regression`.
- Keep lifecycle status to `draft`, `ready`, `archived`.
- Classify existing fixtures as regression or design according to product intent.
- Add holdout rules and limited-visibility behavior.

### Phase 3: Experiment Lab First Slice

- Persist eval runs and results.
- Show run history and metrics in PM Review.
- Add dataset and filter controls.
- Add release gate summary inside Experiment Lab.
- Keep candidate prompts out of first slice.

### Phase 4: Candidate Prompt and Textual Gradient

- Add Candidate Prompt A/B experiments.
- Add current vs candidate result comparison.
- Add Textual Gradient diagnosis from failed cases.
- Generate candidate prompt/rubric/schema suggestions.
- Require regression and holdout checks before promotion.

First implemented slice:

- Store draft prompt candidates with a name, rationale, and instruction patch.
- Run provider-mode A/B by executing one baseline run and one candidate run against the same filters.
- Persist the comparison artifact linking baseline and candidate runs.
- Show improved/regressed counts, recommendation, and Textual Gradient diagnosis.
- Generate a draft Prompt Candidate from Textual Gradient through a saved BYOK provider.
- Generate read-only Prompt Program Suggestions from Textual Gradient across prompt patch, rubric, and schema categories.
- Show accepted Prompt Program Suggestions inside Contract Reference as a contract-first backlog.
- Create named Experiment Workspaces and link runs, candidate comparisons, Prompt Program Suggestions, release decisions, and promotions into one reviewable artifact set.
- Add explicit experiment arms for baseline/current prompt/candidate prompt/variant definitions inside a workspace.
- Promote a passing candidate into the active local Prompt Program through an audited promotion artifact.
- Require passing Design, Regression, and Holdout dataset coverage before promotion.
- Freeze the promoted prompt version on new AI Check sessions and inject its patch into runtime provider messages.

Still later:

- Applying accepted rubric/schema suggestions through contract-first implementation workflows.

## Validation Expectations

Every implementation slice should include:

- contract validation.
- generated contract check.
- eval runner validation.
- turn-level conversion test.
- fixture validation.
- PM Review UI smoke check where UI changes are made.

Specific regression tests:

- converting turn 2 must not include turn 3+ messages.
- converted case must use original round snapshot pattern memory.
- converted case must preserve actual output.
- final-turn case must not allow `ASK_MORE`.
- `AI_COOLDOWN` is treated as terminal in release-gating eval semantics.
