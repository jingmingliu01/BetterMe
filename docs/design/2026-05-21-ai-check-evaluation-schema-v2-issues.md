# 2026-05-21 AI Check Evaluation Schema V2 Issues

Related docs:

- Design: [2026-05-21-ai-check-evaluation-schema-v2-design.md](2026-05-21-ai-check-evaluation-schema-v2-design.md)
- Progress: [2026-05-21-ai-check-evaluation-schema-v2-progress.md](2026-05-21-ai-check-evaluation-schema-v2-progress.md)
- AI Check case schema issues: [2026-05-20-ai-check-case-schema-issues.md](2026-05-20-ai-check-case-schema-issues.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Evaluation expectations are not shaped like model output

Status: closed

Current risk:

- Evaluation expectations are split between `expectedOutput` and root-level eval fields.
- Message, score, cooldown, and memory expectations are harder to connect back to model output fields.
- EvaluationRunner failure reasons are less precise than they could be.

Expected behavior:

- `eval.expectedOutput` mirrors the model Output Schema.
- Each expectation belongs to the output field it evaluates.
- EvaluationRunner compares actual output to expected output and reports field-specific failures.

Resolution:

- Active eval fixtures now store message, cooldown, score, and memory expectations under `eval.expectedOutput`.
- EvaluationRunner now compares field-level expected-output constraints and reports output field paths in failure reasons.
- PM Review writes user-facing message expectations under `eval.expectedOutput.userFacingMessage`.
