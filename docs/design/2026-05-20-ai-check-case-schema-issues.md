# 2026-05-20 AI Check Case Schema Issues

Related docs:

- Design: [2026-05-20-ai-check-case-schema-design.md](2026-05-20-ai-check-case-schema-design.md)
- Progress: [2026-05-20-ai-check-case-schema-progress.md](2026-05-20-ai-check-case-schema-progress.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Category names blur current decision reason and long-term behavior memory

Status: closed

Risk:

- `reasoningCategory` and `memoryUpdate.reasonCategory` sounded like the same concept even though they operated at different levels.
- PM review can misread a behavior pattern such as `boredom` as the reason for a specific enforcement decision.

Expected behavior:

- Product docs and new schema distinguish `decisionReasonCategory` from `behaviorReasonCategory`.
- Runtime, docs, and eval cases should use the new field names directly.

Resolution:

- Added explicit type aliases for both category families.
- Added mapping rubric to the design and prompt.
- Renamed runtime provider output and stored decision fields to `decisionReasonCategory` and `memoryUpdate.behaviorReasonCategory`.

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
- Removed legacy flat-case runner compatibility after migrating built-in fixtures.

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

### ISSUE-004: AI Check facts are still duplicated outside the contract

Status: closed

Risk:

- `maxAssistantTurns`, provider default models, PM Review statuses/tags/case sets, and eval provider prompts can drift from runtime behavior.
- Updating one copy without the others can make evals test a different system than live AI Check.

Expected behavior:

- AI Check session policy and PM Review enum/filter facts come from `apps/extension/src/shared/ai-check-contract.json`.
- Provider metadata comes from `apps/extension/src/shared/provider-config.json`.
- Provider-mode evals reuse the runtime AI Check message builder.
- Default eval runs reject current cases whose prompt/schema/rubric versions do not match the shared contract.

Resolution:

- Added `sessionPolicy`, case status/source/error enums, PM Review common tags, and built-in case sets to the AI Check contract.
- Added shared provider config for runtime and eval runner use.
- Updated provider-mode evals to call the runtime message builder and parse/validate provider output through the runtime parser.
- Updated fixtures to `checkpoint-decision-v2` and the contract session policy.
- Updated `AGENTS.md` so future work keeps these facts single-source.
