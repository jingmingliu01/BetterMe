# Interview Learning Guide

This project can become strong SDE interview material because it combines frontend, browser platform APIs, local security, state machines, API integration, and product privacy tradeoffs.

## How to Frame the Project

Short version:

> I built a Chrome MV3 extension that lets users define websites they want to block. When they visit one, the extension redirects them to a privacy-first AI checkpoint. Free users get basic blocking and cooldown; lifetime BYOK users can connect their own LLM API key. The extension stores data locally, encrypts API keys, uses DNR rules for blocking, and validates structured AI decisions before enforcing temporary unlocks, delays, or blocks.

## Interview-Worthy Technical Topics

### 1. Browser Extension Architecture

What to explain:

- Manifest V3.
- Background service worker.
- Extension pages.
- Message passing.
- DNR redirect.
- Local storage and IndexedDB.

Good interview angle:

> I treated the background service worker as the privileged local coordinator. React pages only render UI and send typed messages. Provider calls, DNR updates, and key decryption all happen in the service worker.

### 2. Privacy-First Blocking

What to explain:

- Did not read browser history.
- Did not read page content.
- Stored user-defined domains/exact URLs only.
- Used DNR because it can redirect/block declaratively.

Tradeoff:

- Redirect block page is less visually slick than blur overlay.
- But it is more stable and privacy-preserving.

### 3. State Machine Design

AI Track states:

```text
ready -> active -> ask_more -> delayed -> active
active -> allowed
active -> blocked
active -> expired
active -> provider_error
```

Good interview angle:

> I represented AI Check as a bounded state machine instead of letting UI branches grow organically. That made ALLOW, DELAY, ASK_MORE, BLOCK, timeout, and provider error behavior deterministic.

### 4. Structured LLM Output

What to explain:

- Model output is untrusted.
- Must validate JSON.
- Invalid JSON triggers one retry.
- Only validated decisions affect blocker state.
- Extension clamps unlock duration by local policy.

Good interview angle:

> The model recommends a decision, but the extension enforces policy. For example, even if the model suggests a long unlock, the extension clamps it by strictness level.

### 5. BYOK Security

What to explain:

- User API key is not sent to BetterMe.
- Key is encrypted locally.
- Non-extractable CryptoKey in IndexedDB.
- Ciphertext in local storage/IndexedDB.
- Plaintext exists only briefly in memory.

Tradeoff:

- Not strong against malware or modified extension code.
- Better than plaintext storage.
- Keeps user experience simple.

### 6. Provider Adapter Design

What to explain:

- OpenAI, DeepSeek, and Kimi all use OpenAI-compatible Chat Completions in MVP.
- A small fetch client is enough.
- Provider-specific config and error normalization keep UI simple.

Good interview angle:

> I avoided introducing a heavy SDK into the extension because I only needed one endpoint and wanted full control over headers, errors, and browser behavior.

### 7. Product and Policy Constraints

What to explain:

- Chrome Web Store requires minimal permissions and clear single purpose.
- NSFW preset is hidden by category, not visible URL list.
- No remote code execution.
- Privacy policy must explain data handling.

Good interview angle:

> Browser extension development is not just frontend. The platform and store policy shape architecture decisions.

## Possible Interview Questions and Strong Answers

### Why not use your own backend for BYOK?

Answer:

> For the lifetime BYOK MVP, the product promise is that users do not need an account or subscription with BetterMe. If the extension can call the user-selected provider directly, the user's API key and AI usage stay between the user and provider. That reduces backend complexity and privacy risk. The tradeoff is that prompts and code are visible locally, and local license enforcement is weaker.

### Why not blur the original page?

Answer:

> Blur overlay requires letting the page load and injecting content scripts. That can briefly expose the content and increases compatibility and privacy risk. Redirecting via DNR is more deterministic and avoids reading page content. I would consider overlay later as an opt-in enhancement.

### How do you prevent repeated excuses?

Answer:

> I do not send raw full history into every LLM call. I store structured track summaries and Pattern Memory. The context builder selects relevant patterns, such as repeated reasons or high-risk time windows, and passes compact memory into the checkpoint prompt.

### What happens if the model returns malformed JSON?

Answer:

> The extension validates every response against a schema. If parsing or validation fails, it retries once with a repair instruction. If that also fails, the AI panel enters provider error state and no access is granted.

### How would you add subscriptions later?

Answer:

> I would add a BetterMe cloud backend with auth, Stripe webhooks, entitlement state, and an AI Track ledger. The extension already talks through a provider abstraction, so the cloud provider can be added beside the BYOK provider.

## Code Artifacts to Build for Interview Value

Prioritize these because they demonstrate engineering judgment:

- `target-parser.ts`: domain vs exact URL normalization.
- `dnr-rules.ts`: deterministic DNR rule generation.
- `ai-track-state.ts`: explicit state machine.
- `checkpoint-schema.ts`: structured output validation.
- `provider-client.ts`: provider adapter and error normalization.
- `crypto-key-store.ts`: API key encryption.
- `context-builder.ts`: layered memory context.

## Tests to Mention

Unit tests:

- Domain normalization.
- Exact URL matching.
- Unlock expiry.
- Block until next local midnight.
- AI decision validation.
- Provider error normalization.

Integration tests:

- Add blocked domain -> DNR rule generated.
- Blocked visit -> redirect URL generated.
- ALLOW -> temporary unlock.
- DELAY -> same track resumes.
- BLOCK -> hold until next day.

Manual tests:

- Install unpacked extension.
- Verify permissions.
- Use invalid API key.
- Confirm no plaintext API key in storage.

## Resume Bullet Drafts

Use these only after you actually implement the corresponding parts.

- Built a Chrome Manifest V3 extension using React and TypeScript to block user-defined domains via declarativeNetRequest and redirect users into a structured self-control checkpoint flow.
- Designed a local AI Track state machine with bounded turns, timeout handling, temporary unlocks, delay timers, and block-until-next-day enforcement.
- Implemented BYOK LLM integration for OpenAI-compatible providers with encrypted local API key storage, provider error normalization, and schema-validated model decisions.
- Built a privacy-first local memory layer that stores summaries and repeated-pattern signals without reading browser history or page content.

