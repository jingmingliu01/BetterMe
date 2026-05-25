# BetterMe

> A Chrome MV3 extension that adds an AI checkpoint before distracting websites, turning a user's stated purpose, time boundary, and exit plan into a concrete product outcome: allow, ask more, start a cooldown, or block.

Most website blockers are binary: a site is either blocked or unblocked. BetterMe treats self-control as a decision moment. The user attempts a guarded site, gets redirected to a checkpoint, explains why access is needed now, and receives an outcome based on intent quality, recent behavior, strictness, and risk.

This repository is the public portfolio version of BetterMe. It shows the extension architecture, AI Check decision loop, local PM Review workspace, evaluation tooling, and design process. Production backend, payment, account, and private launch work live outside this public repo.

## Contents

<p align="center">
  <a href="#product-demo"><strong>Product Demo</strong></a>
  ·
  <a href="#product-idea"><strong>Product Idea</strong></a>
  ·
  <a href="#what-i-built"><strong>What I Built</strong></a>
  ·
  <a href="#technical-highlights"><strong>Technical Highlights</strong></a>
</p>

<p align="center">
  <a href="#repository-map"><strong>Repository Map</strong></a>
  ·
  <a href="#data-persistence-note"><strong>Data Persistence</strong></a>
  ·
  <a href="#run-locally"><strong>Run Locally</strong></a>
  ·
  <a href="#validation"><strong>Validation</strong></a>
</p>

<p align="center">
  <a href="#public-design-notes"><strong>Public Design Notes</strong></a>
  ·
  <a href="#portfolio-notes"><strong>Portfolio Notes</strong></a>
  ·
  <a href="#scope"><strong>Scope</strong></a>
</p>

## Product Demo

### Demo Video

> Placeholder: upload a short BetterMe demo video through GitHub's web UI, then replace this block with the generated video asset link.

### Redirected AI Check

BetterMe interrupts the habit loop at the moment the user tries to open a guarded site.

![BetterMe Redirected AI Check](docs/assets/readme/redirected-ai-check.png)

### Settings and Provider Setup

Users choose guarded domains or URLs, set checkpoint strictness, and connect an OpenAI-compatible provider key.

![BetterMe Settings](docs/assets/readme/settings-provider-setup.png)

### PM Review

The PM Review workspace makes model behavior inspectable: what the model saw, what it returned, and how that decision can become a future evaluation case.

![PM Review Provider Messages](docs/assets/readme/pm-review-provider-messages.png)

### Run Review Console

Experiment Lab turns evaluation runs into reviewable evidence: pass/fail metrics, run history, release-gate checks, and case-level drilldown.

![Run Review Console](docs/assets/readme/run-review-console.png)

## Product Idea

```mermaid
flowchart LR
  User["User"] --> Attempt["Attempts guarded site"]
  Attempt --> Checkpoint["AI checkpoint"]
  Checkpoint --> Decision["Structured decision"]
  Decision --> Outcome["Local product outcome"]
  Decision --> Review["PM review"]
  Review --> Eval["Evaluation case"]
  Eval -. improves .-> Checkpoint
```

The model does not just chat. It drives product state.

## What I Built

- Chrome MV3 extension with popup, settings, onboarding, redirected block page, and PM Review surfaces.
- AI Check session flow with bounded turns, strictness, provider calls, schema parsing, and product outcomes.
- Local persistence for blocked targets, cooldowns, temporary unlocks, AI sessions, behavior events, pattern memory, PM reviews, eval cases, eval jobs, and run results.
- Contract-first AI Check schema for prompt-visible input/output and evaluation expectations.
- Prompt Engineering Console with case library, provider message reference, eval runs, A/B comparison, release gate, and run review.
- Validation scripts for typecheck, build, AI Check logic, contract validation, eval runs, and browser E2E.

## Technical Highlights

- **MV3 architecture**: service worker message routing, declarativeNetRequest rules, redirected block page, and content script expiry guard.
- **AI as deterministic product logic**: provider output is parsed into a strict JSON decision contract before product state changes.
- **Local-first privacy boundary**: AI Check sessions, eval runs, review artifacts, and provider keys stay in extension storage in this public MVP.
- **Prompt engineering workflow**: bad decisions can become structured evaluation cases, then feed regression runs and prompt comparison.
- **Reviewability**: PM Review shows provider messages, output schema, evaluation schema, run results, and release-gate evidence.

## Repository Map

```text
apps/extension/
  src/pages/              Extension pages and PM Review UI
  src/blocking/           Access rules, cooldowns, unlocks, and holds
  src/ai/                 AI Check, provider calls, prompt/context, eval/review logic
  src/background/         MV3 service worker and message router
  src/shared/             Contracts, provider metadata, constants, shared types
  src/storage/            IndexedDB, chrome.storage, encrypted provider-key storage
  evals/ai-check-cases/   Built-in AI Check evaluation cases

docs/design/              Implementation-linked design/progress/issues notes
docs/portfolio/           Public-facing project notes
docs/assets/readme/       README screenshots
```

## Data Persistence Note

BetterMe stores AI Check history, PM Review data, eval cases, eval jobs, eval runs, and eval results locally in the extension's IndexedDB. If the extension is uninstalled, Chrome removes that extension storage. Reinstalling the extension starts with a fresh local database.

More detail: [Data Persistence](docs/portfolio/data-persistence.md)

## Run Locally

```bash
npm install
npm run build
```

Load the built extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `apps/extension/dist`.

For local development:

```bash
npm run dev
```

## Validation

```bash
npm run typecheck
npm run build
npm --workspace apps/extension run check:ai-check-contract
npm --workspace apps/extension run test:ai-check
npm --workspace apps/extension run eval:ai-check
npm --workspace apps/extension run test:e2e
```

## Public Design Notes

| Topic | Design | Progress | Issues |
| --- | --- | --- | --- |
| Access state and local enforcement | [design](docs/design/2026-05-12-access-state-design.md) | [progress](docs/design/2026-05-12-access-state-progress.md) | [issues](docs/design/2026-05-12-access-state-issues.md) |
| AI Check session state machine | [design](docs/design/2026-05-12-ai-check-session-state-machine-design.md) | [progress](docs/design/2026-05-12-ai-check-session-state-machine-progress.md) | [issues](docs/design/2026-05-12-ai-check-session-state-machine-issues.md) |
| PM Review workspace | [design](docs/design/2026-05-20-pm-review-workspace-design.md) | [progress](docs/design/2026-05-20-pm-review-workspace-progress.md) | [issues](docs/design/2026-05-20-pm-review-workspace-issues.md) |
| AI Check contract SSOT | [design](docs/design/2026-05-22-ai-check-contract-ssot-design.md) | [progress](docs/design/2026-05-22-ai-check-contract-ssot-progress.md) | [issues](docs/design/2026-05-22-ai-check-contract-ssot-issues.md) |
| Prompt Engineering Console | [design](docs/design/2026-05-24-prompt-engineering-console-design.md) | [progress](docs/design/2026-05-24-prompt-engineering-console-progress.md) | [issues](docs/design/2026-05-24-prompt-engineering-console-issues.md) |
| Eval Job Model | [design](docs/design/2026-05-25-eval-job-model-design.md) | [progress](docs/design/2026-05-25-eval-job-model-progress.md) | [issues](docs/design/2026-05-25-eval-job-model-issues.md) |
| Run Review Console | [design](docs/design/2026-05-25-run-review-console-design.md) | [progress](docs/design/2026-05-25-run-review-console-progress.md) | [issues](docs/design/2026-05-25-run-review-console-issues.md) |

## Portfolio Notes

- [Project Overview](docs/portfolio/project-overview.md)
- [Data Persistence](docs/portfolio/data-persistence.md)

## Scope

This public repo is intentionally focused on the browser extension MVP and portfolio-friendly AI product engineering work. Backend ingestion, account, subscription, payment, and private production roadmap work are excluded from this public version.
