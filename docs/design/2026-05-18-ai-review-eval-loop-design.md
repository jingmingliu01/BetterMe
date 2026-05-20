# 2026-05-18 AI Review Eval Loop Design

Related docs:

- Progress: [2026-05-18-ai-review-eval-loop-progress.md](2026-05-18-ai-review-eval-loop-progress.md)
- Issues: [2026-05-18-ai-review-eval-loop-issues.md](2026-05-18-ai-review-eval-loop-issues.md)
- AI Check state machine: [2026-05-12-ai-check-session-state-machine-design.md](2026-05-12-ai-check-session-state-machine-design.md)
- Access state foundation: [2026-05-12-access-state-design.md](2026-05-12-access-state-design.md)

Rule: when this document changes, check the progress and issues documents for required updates.

## Product Intent

BetterMe should be a local AI behavior-intervention loop, not just a chat gate.

The MVP loop is:

```text
blocked site
  -> AI Check conversation
  -> structured decision
  -> local enforcement
  -> PM review marks bad case
  -> bad case becomes eval case
  -> prompt/schema/rubric changes are regression-tested
```

The first implementation remains BYOK and local-first. The extension can demonstrate the loop without a cloud backend.

## User-Facing Decision Card

The latest decision belongs inside the chat transcript. It should appear directly after the assistant message that caused the decision.

Meter semantics:

```text
BLOCK -------- AI COOLDOWN -------- ALLOW
```

- `BLOCK`: high-risk, impulsive, repeated, or unbounded.
- `AI_COOLDOWN`: possibly valid, but not deliberate enough yet.
- `ALLOW`: specific, bounded, and intentional.
- `ASK_MORE`: non-terminal. It can show a leaning meter but should not look like final enforcement.

Held read-only mode shows the previous final decision card in the transcript and disables new negotiation until the hold expires.

## Review Workspace

Add a local AI PM Review Workspace at `review.html`.

Core jobs:

- list recent AI Check sessions.
- inspect transcript, decision JSON, provider metadata, strictness, and stored enforcement outcome.
- mark a session/decision as a bad case.
- assign one or more error types.
- choose expected decision and write reviewer notes.
- convert the bad case into an eval case.

Review workspace is for PM/developer iteration, not the main blocked-page user journey.

## Bad Case Model

```ts
type BadCaseErrorType =
  | "over_allow"
  | "over_block"
  | "under_ask"
  | "unnecessary_ask"
  | "wrong_reason_strength"
  | "wrong_strictness_application"
  | "wrong_cooldown_duration"
  | "unsafe_sensitive_advice"
  | "bad_tone"
  | "schema_or_format_failure";

interface BadCaseReview {
  id: string;
  sourceSessionId: string;
  sourceDecisionId: string | null;
  targetDisplay: string;
  strictness: StrictnessLevel | null;
  messages: AICheckMessage[];
  actualDecision: AIDecision | null;
  expectedDecision: AIDecision | null;
  errorTypes: BadCaseErrorType[];
  reviewerNote: string;
  convertedEvalCaseId?: string;
  createdAt: string;
  updatedAt: string;
}
```

## Eval Case Model

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

The eval case shape is unified around `input`, optional `output`, and optional `eval`.
`input` is the only model-visible section. `eval` contains PM/evaluator-only assertions.
The detailed schema lives in [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md).

## Eval Runner

The local command is:

```bash
npm --workspace apps/extension run eval:ai-check
```

The first formal case set lives under:

```text
apps/extension/evals/ai-check-cases/
```

Case files are grouped by decision risk:

- `over-allow.json`
- `over-block.json`
- `ask-more.json`
- `reason-strength.json`
- `strictness-rubric.json`
- `sensitive-advice.json`
- `repeated-pattern.json`

Runner scope:

- load all built-in case files from the eval case directory.
- optionally load a custom case file or directory through `--cases=<path>`.
- validate expected decision, allowed/disallowed decisions, reasoning category, cooldown range, score ranges, required questions, and forbidden wording.
- run deterministic mock mode by default.
- report overall pass rate and pass rate by tag.

Provider mode:

```bash
npm --workspace apps/extension run eval:ai-check -- --provider=openai --model=<model>
npm --workspace apps/extension run eval:ai-check -- --provider=deepseek --model=<model>
npm --workspace apps/extension run eval:ai-check -- --provider=kimi --model=<model>
```

Provider mode reads `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, or `KIMI_API_KEY` from the local environment.

Future runner scope:

- prompt/rubric version comparisons.
- direct import of PM Review exported eval cases.
- persisted eval run/result history in the extension UI.

## Versioning

Every AI session should eventually carry:

- `promptVersion`
- `schemaVersion`
- `rubricVersion`

The first implementation may use constants and include them in eval output before all stored sessions are migrated.
