# BetterMe Project Overview

BetterMe is a portfolio project demonstrating AI product engineering inside a Chrome extension.

The product goal is to create intentional friction before distracting websites. The user can still access a guarded site, but only after passing through an AI checkpoint that asks for purpose, time boundary, and exit plan.

## Product Loop

```text
Attempt guarded site
  -> redirected checkpoint
  -> AI structured decision
  -> local enforcement outcome
  -> PM review for bad or surprising decisions
  -> evaluation case
  -> prompt and policy improvement
```

## Why It Is Interesting

- The AI is not decorative. Its parsed output changes product state.
- The model is constrained by a contract and parser instead of free-form chat.
- The extension has local enforcement primitives: block holds, cooldowns, temporary unlocks, and target-scoped memory.
- AI failures are not ignored. They become review artifacts and evaluation cases.
- The PM Review workspace makes prompt behavior inspectable through provider messages, schema reference, eval runs, and run review.

## Main Engineering Areas

- Chrome MV3 service worker and message routing.
- DeclarativeNetRequest target blocking.
- Redirected block page as the main product surface.
- AI Check session state machine.
- Provider request builder and JSON parser.
- Local IndexedDB persistence.
- Prompt/evaluation contract generation.
- Evaluation runner, durable eval jobs, and run review.
- Browser E2E coverage.

## Public vs Production Scope

This public repository is kept as a portfolio and technical case-study artifact.

Excluded from this public repo:

- production backend.
- account system.
- subscription and payment logic.
- production deployment.
- private launch and compliance materials.
- real user feedback ingestion.

Those concerns belong to the private production repo.
