# 2026-05-18 AI Review Eval Loop Issues

Related docs:

- Design: [2026-05-18-ai-review-eval-loop-design.md](2026-05-18-ai-review-eval-loop-design.md)
- Progress: [2026-05-18-ai-review-eval-loop-progress.md](2026-05-18-ai-review-eval-loop-progress.md)

Rule: when this document changes, check the design and progress documents for required updates.

## Issue Log

### ISSUE-001: Review workspace and eval loop do not exist yet

Status: closed

Current risk:

- Bad AI Check decisions can be noticed manually but cannot be saved as structured bad cases.
- Prompt, output schema, and evaluation schema changes cannot be regression-tested against prior mistakes.
- The product demonstrates AI Check but not the full PM review to eval case loop.

Expected behavior:

- PM can inspect sessions and mark bad cases.
- Bad cases can be converted into eval cases.
- A local eval runner can execute built-in and exported cases.

Resolution:

- Added `review.html` AI PM Review Workspace.
- Added local bad case and eval case stores.
- Added bad case save/update and convert-to-eval message routes.
- Added fixture-based `eval:ai-check` runner.
- E2E covers bad case save and eval case conversion.

### ISSUE-002: Decision meter does not express the full decision space

Status: closed

Current risk:

- A two-ended meter labeled `Cool down` and `Allow` hides the `BLOCK` end of the decision spectrum.
- The decision summary can feel detached from the conversation.

Expected behavior:

- Decision card renders inside the chat transcript.
- Meter is explicitly `BLOCK -> AI COOLDOWN -> ALLOW`.
- `ASK_MORE` remains non-terminal and should not read as final enforcement.

Resolution:

- Decision card now renders inside the message list after the current transcript.
- Meter labels and marker logic now use `Block`, midpoint `AI Cooldown`, and `Allow`.
- Meter marker color and placement reflect block/cooldown/allow zones.
