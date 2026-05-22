# 2026-05-18 AI Review Eval Loop Progress

Related docs:

- Design: [2026-05-18-ai-review-eval-loop-design.md](2026-05-18-ai-review-eval-loop-design.md)
- Issues: [2026-05-18-ai-review-eval-loop-issues.md](2026-05-18-ai-review-eval-loop-issues.md)
- AI Check progress: [2026-05-12-ai-check-session-state-machine-progress.md](2026-05-12-ai-check-session-state-machine-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

The first local review/eval loop is implemented.

The existing AI Check flow supports local BYOK provider calls, structured decisions, behavior history, AI cooldown, block holds, held read-only replay, and now PM review conversion into eval cases.

The next-stage PM Review workspace design is tracked in [2026-05-20-pm-review-workspace-design.md](2026-05-20-pm-review-workspace-design.md). That newer design expands the workspace beyond History Case review into Evaluation Case management, Regression Case filtering, and Schema Reference.

## Planned Slice

2026-05-18:

- Moved the decision card into the chat transcript.
- Changed the meter to `BLOCK -> AI COOLDOWN -> ALLOW`.
- Added local bad case, eval case, eval run, and eval result stores.
- Added AI PM Review Workspace at `review.html`.
- Added conversion from bad case to eval case.
- Added local `eval:ai-check` runner with fixture-based coverage.
- Added E2E coverage for saving a bad case and converting it into an eval case.

2026-05-18:

- Expanded the initial Agent decision eval set to 42 cases across:
  - over-allow
  - over-block
  - under-ask
  - unnecessary-ask
  - reason strength
  - strictness behavior
  - sensitive advice boundary
  - repeated pattern handling
- Split eval cases into categorized files under `apps/extension/evals/ai-check-cases/`.
- Upgraded `eval:ai-check` to load case directories, support custom `--cases`, report pass rate by tag, and support OpenAI/DeepSeek/Kimi provider modes through local BYOK environment variables.

## Validation Status

Latest validation:

- `npm --workspace apps/extension run typecheck`
- `npm --workspace apps/extension run build`
- `npm --workspace apps/extension run test:ai-check`
- `npm --workspace apps/extension run eval:ai-check` passed 42/42 in mock mode
- `npm --workspace apps/extension run test:e2e`

## Update Checklist

When this progress doc changes, check:

- Design doc: did implementation change the intended loop?
- Issues doc: should an implementation risk be opened or closed?
