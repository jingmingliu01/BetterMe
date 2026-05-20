# 2026-05-20 AI Check Case Schema Issues

Related docs:

- Design: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- Progress: [2026-05-20-ai-check-case-schema-progress.md](2026-05-20-ai-check-case-schema-progress.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Category names blur current decision reason and long-term behavior memory

Status: closed

Risk:

- `reasoningCategory` and `memoryUpdate.reasonCategory` sound like the same concept even though they operate at different levels.
- PM review can misread a behavior pattern such as `boredom` as the reason for a specific enforcement decision.

Expected behavior:

- Product docs and new schema distinguish `decisionReasonCategory` from `behaviorReasonCategory`.
- Runtime compatibility can keep existing field names until a dedicated migration is safe.

Resolution:

- Added explicit type aliases for both category families.
- Added mapping rubric to the design and prompt.

### ISSUE-002: Eval case schema mixes model-visible input with evaluator-only assertions

Status: closed

Risk:

- A flat case makes it unclear which fields are shown to the LLM and which fields are ground truth.
- Future provider evals could accidentally leak expected answers into the prompt.

Expected behavior:

- Eval cases use `input`, optional `output`, and `eval` sections.
- Runtime model calls use only `input`.
- The eval runner compares `output` against `eval`.

Resolution:

- Added `AICheckCase`.
- Updated bad-case conversion to write the new shape.
- Updated runner compatibility to support both old and new case shapes.

### ISSUE-003: Score contract is under-specified

Status: closed

Risk:

- The model can omit scores or return values outside the intended 0-100 independent-rating contract.
- Downstream evals may over-trust invalid score values.

Expected behavior:

- Prompt defines scores as independent 0-100 ratings.
- Parser rejects missing or out-of-range scores.
- Provider client performs one repair retry before treating the response as a schema error.

Resolution:

- Added score instructions to the prompt.
- Added parser validation and provider repair retry.
