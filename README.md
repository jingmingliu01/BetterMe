# BetterMe Documentation

BetterMe is a Chrome-only Manifest V3 browser extension for self-control around user-defined high-dopamine websites.

The current MVP direction is:

- Free tier: unlimited blocked sites, no usable AI Check, but AI Check UI is present and locked.
- Lifetime BYOK tier: unlocks AI Check, Pattern Memory, advanced Strictness, and local LLM API key configuration.
- No cloud backend in MVP, except a future license endpoint. LLM calls are made from the extension background service worker using the user's own API key.
- Future cloud subscription can add login, Stripe, hosted AI, monthly AI checks, top-ups, and account recovery.

## Recommended Reading Order

1. [Browser Extension Introduction](docs/00-browser-extension-introduction.html)  
   Read this first if you know web/iOS development but not extension development.

2. [Product PRD](docs/01-product-prd.md)  
   Product positioning, user tiers, MVP scope, and user flows.

3. [Decision Record](docs/02-decision-record.md)  
   Fixed product and technical decisions from the discussion.

4. [Extension Architecture](docs/03-extension-architecture.md)  
   Manifest V3, service worker, React pages, storage, and message passing.

5. [Blocking and Routing Spec](docs/04-blocking-and-routing-spec.md)  
   Domain matching, exact URL blocking, DNR redirect, cooldown, delay, block, and unlock rules.

6. [AI Check Spec](docs/05-ai-check-spec.md)  
   AI Track state machine, opening message, decisions, memory, and unavailable states.

7. [LLM Provider Spec](docs/06-llm-provider-spec.md)  
   OpenAI, DeepSeek, and Kimi through OpenAI-compatible Chat Completions.

8. [Local Security and License Spec](docs/07-local-security-and-license.md)  
   API key encryption, local license mock, and future license endpoint.

9. [Implementation Roadmap](docs/08-implementation-roadmap.md)  
   Step-by-step build order for hand-writing the project.

10. [API and Browser Reference](docs/09-api-and-browser-reference.md)  
    Verified links and API notes to keep beside your editor.

11. [Interview Learning Guide](docs/10-interview-learning-guide.md)  
    How to turn this project into strong SDE interview talking points.

## Current Non-Goals

- No mobile app.
- No accountability partner.
- No community features.
- No cloud AI ledger in MVP.
- No real Stripe flow in MVP.
- No Codex app-server integration in MVP.
- No browser history analysis.
- No page content reading.
- No NSFW URL display in the UI for MVP.

