# 2026-05-24 Prompt Engineering Console Progress

Related docs:

- Design: [2026-05-24-prompt-engineering-console-design.md](2026-05-24-prompt-engineering-console-design.md)
- Issues: [2026-05-24-prompt-engineering-console-issues.md](2026-05-24-prompt-engineering-console-issues.md)
- PM Review workspace progress: [2026-05-20-pm-review-workspace-progress.md](2026-05-20-pm-review-workspace-progress.md)
- AI Check contract SSOT progress: [2026-05-22-ai-check-contract-ssot-progress.md](2026-05-22-ai-check-contract-ssot-progress.md)

Rule: when this document changes, check the design and issues documents for required updates.

## Current Status

Phase 1, Phase 2, the Phase 3 Experiment Lab first slice, and the Phase 4 Candidate Prompt/Textual Gradient first slice are implemented enough to support the current Prompt Engineering Console workflow, with future contract-change application work intentionally left as explicit code/doc implementation slices.

This document set remains the scaffold for the larger Prompt Engineering Console implementation. Candidate Prompt A/B, Textual Gradient, and a guarded local promotion flow now have a first Phase 4 implementation.

## Product Decisions Locked

- Legacy local PM Review data does not need to be preserved as a design constraint.
- Evaluation Case should be one decision point, not a whole session.
- When a selected turn is converted to eval, future turns after that decision point must be excluded from eval input.
- `AI_COOLDOWN` is terminal in product and release-gating semantics.
- Decision-point snapshots should be accepted as the reliable way to make review/eval reproducible.
- `datasetType` should be independent from lifecycle `status`.
- Candidate Prompt A/B and Textual Gradient are Phase 4 capabilities layered on top of the persisted run/result foundation.

## Already Exists

- Local PM Review page at `review.html`.
- History Cases area listing recent AI Check sessions.
- Current History detail shows transcript, selectable decision points, strictness, actual decision, turn count, model output JSON, and stored decision record.
- Bad-case marking with expected decision, error types, and reviewer note.
- Bad-case conversion into an Evaluation Case from the selected decision point.
- `AICheckCase` schema with `input`, optional `output`, `eval`, lifecycle `status`, `datasetType`, `provenance`, optional `lineage`, and archive metadata.
- Eval-case normalization preserves only the current unified `eval.expectedOutput`, `eval.expectedInputEvidence`, `eval.tags`, and `eval.reviewerNote` shape; legacy expectation fields are not migrated.
- Built-in eval fixtures under `apps/extension/evals/ai-check-cases`.
- Built-in eval fixtures are visible in Case Library as contract defaults, with explicit origin badges and local override guidance.
- Local `eval:ai-check` runner with status/tag/dataset filtering and provider-mode reuse of runtime provider messages.
- Contract validation rejects extra fixture fields, which guards the current evaluation schema against silently reintroducing legacy expectation keys.
- Experiment Lab can run the current Prompt Program in mock mode, persist `evalRuns`/`evalResults`, show metrics, failures, run history, and release gate summary.
- Contract Reference / Contract Manual exists for provider messages, Prompt Program policy, output, and evaluation.

## Confirmed Gaps

- Decision Point snapshots are persisted at runtime in `aiCheckDecisionPoints` and can still be derived from session history as fallback.
- History review shows whether the selected decision point is using the runtime-persisted snapshot or a derived fallback.
- Review UI can select an arbitrary decision point in the current session.
- New BadCaseReview records prefer the persisted selected decision-point input snapshot and exclude future turns.
- Conversion to eval uses the stored input snapshot when present and preserves captured model output.
- New conversion uses original round snapshot pattern memory instead of reloading current pattern memory.
- Built-in fixture cases and local editable eval cases are unified in Case Library, with origin filters and built-in default affordances.
- Dataset split exists in the contract and fixtures. Experiment Lab now protects Holdout details in tuning mode and exposes them only in release review mode.
- Experiment Run is persisted and visible in PM Review for mock-mode and provider-mode current Prompt Program runs.
- Release Gate exists as an Experiment Lab result summary, and PM Review now stores first-slice Release Decisions against selected runs.
- Release approval is blocked for tuning-mode runs that include Holdout cases; PMs must rerun in release review mode before approval.

## Planned Phases

### Phase 1: Decision-Point Review Foundation

Status: implemented

Scope:

- Add decision-point timeline to History/Review.
- Let PM select a specific decision point before marking bad case.
- Split Model Output from Stored Decision Record in UI.
- Build selected decision-point snapshot from original session data.
- Convert selected decision point into eval case without future turns.
- Preserve actual output in converted eval case.
- Treat `AI_COOLDOWN` as terminal in docs, eval semantics, and product messaging.

Implemented now:

- History/Review shows a decision-point selector.
- PM bad-case review can target the selected decision.
- New bad-case snapshots exclude future turns from replayable eval input.
- Converted eval cases preserve captured model output when a source decision exists.
- Runtime persists decision-point snapshots at provider decision time.
- `AI_COOLDOWN` is terminal after its timer and does not reopen the same AI Check round.

Still remaining:

- None for the implemented decision-point review foundation.

### Phase 2: Ideal Case Model and Dataset Split

Status: implemented

Scope:

- Update evaluation schema for `datasetType`, `provenance`, and optional `lineage`.
- Remove `bad_case_review` from case source semantics.
- Use `provenance.type = "review"` for cases created through PM review.
- Separate lifecycle `status` from dataset membership.
- Reclassify existing fixtures into design/regression/holdout according to PM intent.
- Define holdout limited-visibility behavior.

Implemented now:

- Evaluation schema version moved to `ai-check-evaluation-v3`.
- `datasetType`, `provenance`, and optional `lineage` are in the contract and generated types.
- `source` case semantics are removed from `AICheckCase`.
- Existing built-in fixtures are reclassified as `status = ready` and `datasetType = regression`.
- Case Library exposes a Case origin filter and built-in default badges so PMs can distinguish authored, review-derived, real-session, and bundled fixture cases.
- Eval runner accepts dataset filters.
- Experiment Lab defines Holdout visibility behavior: tuning mode hides detailed Holdout failures while release review mode can show controlled failure summaries.

Still remaining:

- None for the implemented case model, dataset split, and Holdout visibility scope.

### Phase 3: Experiment Lab First Slice

Status: implemented

Scope:

- Persist eval runs and eval results.
- Show run history in PM Review.
- Add dataset and filter controls.
- Show metrics: pass rate, false allow, false block, ASK_MORE recall, schema validity, unsafe sensitive failures, reason quality.
- Add release gate summary inside Experiment Lab.
- Run current Prompt Program only.

Implemented now:

- Experiment Lab tab exists in PM Review.
- PM can select dataset, status, tag, strictness, expected decision, and archived-case inclusion.
- PM can choose tuning or release review mode.
- PM can choose mock mode or a saved BYOK provider/model for provider-mode UI runs.
- Running an experiment stores an `AICheckEvalRun` plus per-case `AICheckEvalResult` rows locally.
- Metrics show pass rate, failed categories, tag/strictness breakdowns, failures, run history, and release gate summary.
- Tuning mode hides Holdout breakdowns and failure details while preserving aggregate metrics and release gate status.
- Approval is disabled for tuning-mode runs that include Holdout cases.
- PM can approve or block release for a selected run with a release note; the stored decision snapshots gate status, metrics, provider/model, and versions.
- CLI `eval:ai-check` can write an importable `AICheckEvalRunSummary` artifact, and Experiment Lab can import that artifact into local run history.
- First slice runs the current Prompt Program only, while Phase 4 now adds provider-mode candidate comparisons on top of the same run/result foundation.

Still remaining:

- None for the implemented Experiment Lab first-slice scope.

### Phase 4: Candidate Prompt and Textual Gradient

Status: first slice implemented

Scope:

- Add Candidate Prompt A/B experiment arms.
- Compare current vs candidate Prompt Program.
- Add Textual Gradient diagnosis from failed cases.
- Generate prompt/rubric/schema candidate suggestions.
- Require Design, Regression, and Holdout checks before promotion.

Implemented now:

- Experiment Lab can save draft Prompt Candidates with name, instruction patch, and rationale.
- Candidate Prompt A/B runs require a BYOK provider so the candidate patch can affect model behavior.
- A/B comparison executes a baseline run and candidate run against the same case filters.
- Candidate provider messages append the patch inside `<candidate_prompt_patch>` while keeping the normal provider-message order.
- PM Review persists `promptCandidates` and `promptComparisons`.
- Comparison view shows baseline vs candidate pass rate, improved/regressed counts, recommendation, and Textual Gradient clusters/directions/risk notes.
- PM can generate a new draft Prompt Candidate from Textual Gradient using a saved BYOK provider.
- PM can generate read-only Prompt Program Suggestions from Textual Gradient using a saved BYOK provider; suggestions are categorized as prompt patch, rubric, or schema and are persisted in `promptProgramSuggestions`.
- PM can accept or reject individual Prompt Program Suggestion items. Accepted items are tracked as contract-first implementation inputs and do not mutate the active prompt, schema, rubric, release decision, or promotion state.
- Contract Reference shows accepted Prompt Program Suggestions as a contract-first backlog with reminders to update `ai-check-contract.json`, generated references, eval assertions or fixtures, and linked docs.
- PM can create `ContractChangePlan` artifacts from accepted suggestions. Plans record prompt/rubric/schema/evaluation targets, required implementation surfaces, and the prompt/output/evaluation versions current at plan creation without mutating the runtime prompt or source contract.
- PM can move Contract Change Plans through `draft`, `ready`, `applied`, or `rejected`; `applied` requires an implementation note, structured evidence, target-specific version changes since plan creation, and records the current prompt/output/evaluation versions.
- `ai-check-contract.json` now owns the Prompt Program rubric under `promptProgram`. Generated constants feed both the provider system prompt and Contract Reference's Prompt Program tab.
- Evaluation schema v4 adds `eval.expectedInputEvidence` for duration and return-plan evidence; the shared eval engine and CLI runner now check those assertions against case input messages.
- PM Review's Evaluation Case editor can author and edit expected input evidence with explicit duration and return-plan controls.
- PM can create named Experiment Workspaces and link selected runs, Candidate Prompt comparisons, Prompt Program Suggestions, release decisions, and promotions into one reviewable artifact set.
- PM can add explicit Experiment Arms for baseline, current prompt, candidate prompt, or variant definitions, optionally linked to a Prompt Candidate and/or eval run.
- PM can promote a recommended candidate only when it has no regressions, a non-failing candidate release gate, and passing Design/Regression/Holdout coverage.
- Promotion creates a `promptPromotions` audit record and makes that candidate patch the active local Prompt Program for new AI Check sessions.
- Runtime AI Check freezes the promoted Prompt Program version on session start and injects the promoted patch into provider messages.

Still remaining:

- Applying any future output-schema changes remains a separate contract-first implementation slice when such a schema change is actually accepted.

## Validation Status

Implementation validation performed:

- `npm --workspace apps/extension run check:ai-check-contract` passed.
- `npm --workspace apps/extension run audit:prompt-console` passed.
- `npm --workspace apps/extension run typecheck` passed.
- `npm --workspace apps/extension run test:ai-check` passed with the known Vite WebSocket sandbox warning.
- `npm --workspace apps/extension run eval:ai-check` passed with 44/44 cases.
- `npm --workspace apps/extension run build` passed.
- `npm --workspace apps/extension run test:e2e` passed.
- Browser smoke check passed: PM Review rendered, Evaluation Cases showed 44 cases, Experiment Lab ran 44/44 and saved a PASS release-gate run.
- `test:ai-check` includes focused coverage that selecting turn 2 excludes turn 3+ from replayable eval input.
- `test:e2e` includes Holdout visibility coverage: tuning mode hides Holdout failure details, release review mode reveals the failure summary.
- `test:e2e` includes Holdout approval guard coverage (`HOLDOUT_APPROVAL_GUARD_OK true`): tuning-mode Holdout runs cannot be approved in the UI or background API.
- `test:e2e` includes Holdout Textual Gradient guard coverage (`HOLDOUT_TEXTUAL_GRADIENT_GUARD_OK true`): tuning-mode Holdout comparisons store redacted Textual Gradient, hide Holdout case titles, and reject candidate generation through the background API.
- `test:e2e` includes provider-mode Experiment Lab coverage: saved BYOK provider, runtime provider messages, BYOK run metadata, and one focused passing provider run.
- `test:e2e` includes decision-point snapshot source coverage (`SNAPSHOT_SOURCE_UI_OK true`): History review shows the selected decision point as Runtime when the persisted runtime snapshot is available.
- `test:e2e` includes Case Library origin coverage (`CASE_LIBRARY_ORIGIN_OK true`): PM Review filters to built-in defaults and shows the local override guidance in the selected case detail.
- `test:e2e` includes Release Decision coverage: approving a passing provider-mode run persists an approved decision with the run id and gate status.
- CLI `eval:ai-check -- --output=...` writes the shared run artifact; shape validation confirmed the artifact has one run and 44 linked results.
- `test:e2e` includes Eval Run artifact import coverage: Experiment Lab imports a run artifact and persists matching `evalRuns`/`evalResults` records.
- `test:e2e` includes Candidate Prompt A/B coverage: Experiment Lab saves a candidate, runs baseline/candidate provider calls, injects `<candidate_prompt_patch>`, persists comparison regression/recommendation, and shows Textual Gradient.
- `test:e2e` includes Textual Gradient candidate generation coverage: Experiment Lab asks a BYOK provider for a draft candidate, sends Textual Gradient context, and persists the generated Prompt Candidate.
- `test:e2e` includes Prompt Program Suggestions coverage: Experiment Lab asks a BYOK provider for prompt patch/rubric/schema suggestions from Textual Gradient and persists them in `promptProgramSuggestions`.
- `test:e2e` includes Prompt Program Suggestion review coverage: PM Review accepts and rejects individual suggestion items and persists review state for the contract-first handoff.
- `test:e2e` includes Contract-first backlog coverage (`PROMPT_PROGRAM_BACKLOG_OK true`): accepted Prompt Program Suggestions appear in Contract Reference with contract-source guidance.
- `test:e2e` includes Prompt Program Contract Reference coverage (`PROMPT_PROGRAM_CONTRACT_REFERENCE_OK true`): Contract Reference shows contract-backed decision policy and scoring rules from `AI_CHECK_CONTRACT.promptProgram`.
- `test:e2e` includes expected input evidence authoring coverage (`EXPECTED_INPUT_EVIDENCE_AUTHORING_OK true`): authored eval cases persist duration and return-plan evidence expectations.
- `test:e2e` includes Contract Change Plan coverage (`CONTRACT_CHANGE_PLAN_OK true`): Contract Reference creates a non-mutating plan from an accepted suggestion, persists its targets, required implementation surfaces, and creation-time versions, rejects applied state before required target versions change, then records ready/applied lifecycle state with implementation note and contract versions.
- `test:e2e` includes Experiment Workspace coverage (`EXPERIMENT_WORKSPACE_OK true`): PM Review creates a named workspace, adds an explicit candidate arm, and links run, comparison, and suggestion artifacts.
- `test:e2e` includes Prompt Promotion coverage: PM Review promotes only after passing Design/Regression/Holdout coverage, persists `promptPromotions`, freezes the promoted Prompt Program version on a new runtime AI Check session, and injects the promoted patch into provider messages.

Pending implementation validation:

- None for the implemented Phase 4 first-slice scope.

## Synchronization Note

2026-05-24:

- Created Prompt Engineering Console design/progress/issues docs.
- Locked product decisions from review: no legacy data constraint, one eval case per decision point, future turns excluded, `AI_COOLDOWN` terminal, dataset type independent from status, Candidate Prompt A/B and Textual Gradient deferred to second Experiment Lab step.
- Older PM Review docs were checked for structure and current implementation status. They were not edited because this document set defines the future scaffold and no implementation status changed in the existing PM Review workspace.

2026-05-24 implementation update:

- Began Phase 1 and Phase 2 implementation.
- Added decision-point selection and selected-decision bad-case conversion in PM Review.
- Updated AI Check evaluation schema to v3 with dataset/provenance/lineage model.
- Reclassified built-in eval fixtures to ready regression dataset cases.
- Issues document was updated because issue status changed. Design document was checked; its product direction and phase structure still apply.

2026-05-24 eval schema strictness update:

- Removed runtime conversion from legacy eval expectation fields into `eval.expectedOutput`.
- Added strict extra-field rejection to AI Check contract shape validation and logic-test coverage for old eval fields.
- Issues document was updated because `ISSUE-004` is now fully mitigated. Design document was checked; its current product model already says Evaluation Cases use the unified decision-point case shape, so no design change was required.

2026-05-24 Experiment Lab update:

- Added built-in fixture visibility to Case Library, so the 44 regression fixtures appear in PM Review without manual IndexedDB seeding.
- Added Experiment Lab first slice with local mock-mode run persistence, metrics, failure list, run history, and release gate summary.
- Issues document was updated for Experiment Lab productization status. Design document was checked; the high-level model remains unchanged.

2026-05-24 decision-point and terminal cooldown update:

- Runtime now persists `AICheckDecisionPointSnapshot` rows when provider decisions are created.
- Bad-case review prefers persisted decision-point snapshots and falls back to deterministic derivation for older sessions.
- Added automated turn-level coverage proving selected turn conversion excludes future messages.
- `AI_COOLDOWN` now resolves to a terminal completed checkpoint after its timer rather than reopening the same round.
- Issues document was updated because Phase 1 and terminal cooldown risks were mitigated. Design document still applies.

2026-05-24 AI cooldown fixture hardening update:

- Added two regression fixtures for terminal `AI_COOLDOWN`: final-turn vague social browsing and gentle-mode vague break behavior.
- The fixtures assert bounded `aiCooldownSeconds` and cooldown-facing copy, strengthening release-gating coverage for cooldown semantics.
- `eval:ai-check` now passes 44/44 active cases.
- Issues document was updated because ISSUE-003 is now mitigated by runtime behavior, product copy, E2E, and dedicated eval fixtures.

2026-05-24 Holdout visibility update:

- Added `mode = tuning | release_review` to eval runs.
- Experiment Lab tuning mode now hides Holdout breakdowns and failure details.
- Release review mode can reveal Holdout failure summaries for explicit release decisions.
- Issues document was updated because Holdout visibility is now productized at the first-slice level. Design document was updated to record the mode rule.

2026-05-24 Holdout approval guard update:

- Release approval is now disabled in PM Review for tuning-mode runs that include Holdout cases.
- `createReleaseDecision` rejects approved decisions for Holdout runs unless the run mode is `release_review`.
- E2E covers both the visible approval guard and the background API guard.

2026-05-24 provider-mode Experiment Lab update:

- Added Experiment Lab provider/model controls.
- Provider-mode UI runs use saved local BYOK keys, provider-config model allowlists, runtime provider messages, and the shared response parser/validator.
- Provider-mode runs persist with `providerMode = byok`, provider id, model, run metrics, and per-case results.
- Issues document was updated because provider-mode UI runs moved from open gap to implemented first-slice behavior. Design document was updated to clarify provider/model selection.

2026-05-24 Release Decision update:

- Added `releaseDecisions` local store and review APIs.
- Experiment Lab now lets PM approve or block release for a selected Experiment Run with a note.
- Stored Release Decisions snapshot prompt/schema versions, provider/model, release gate status, gate reasons, and metrics.
- Issues document was updated because a first-slice release decision workflow now exists. Design document was updated to clarify that this approves the current Prompt Program for the selected run context until Candidate Prompt promotion exists.

2026-05-24 CLI artifact bridge update:

- CLI eval runner now supports `--output=<path>` and writes the shared `AICheckEvalRunSummary` artifact shape.
- Experiment Lab now imports that artifact into local `evalRuns` and `evalResults`.
- Issues document was updated because CLI/UI shared persistence moved from open gap to implemented first-slice behavior. Design document was updated to document the shared run artifact contract.

2026-05-24 Candidate Prompt A/B update:

- Added Prompt Candidate and Prompt Comparison local stores and review APIs.
- Experiment Lab now saves draft candidate prompt patches, runs provider-mode baseline/candidate comparisons, and stores comparison artifacts.
- Textual Gradient now summarizes comparison failures into clusters, directions, and risk notes.
- Issues document was updated because Candidate Prompt A/B and Textual Gradient moved from deferred to first-slice implemented, with promotion still open. Design document was updated to document the narrower candidate/comparison artifact model.

2026-05-24 Candidate Promotion update:

- Added Prompt Promotion local store and review APIs.
- Experiment Lab now lets PM promote only candidates that have a promotion recommendation, no regressions, a non-failing candidate release gate, and passing Design/Regression/Holdout coverage.
- New AI Check sessions now freeze the active promoted Prompt Program version and use the promoted patch in runtime provider messages.
- Issues document was updated because candidate promotion moved from open to first-slice implemented. Design document was updated to document the promotion artifact, dataset coverage gate, and runtime activation rule.

2026-05-24 Textual Gradient candidate generation update:

- Experiment Lab now asks a saved BYOK provider to draft a new Prompt Candidate from a comparison's Textual Gradient.
- Generated candidates are saved as draft Prompt Candidates and must still pass A/B comparison and promotion gates.
- Issues document was updated because LLM-assisted append-only prompt candidate generation moved from open to first-slice implemented. Design document was updated to document the generation boundary.

2026-05-24 Holdout Textual Gradient guard update:

- Tuning-mode Candidate Prompt comparisons that include Holdout cases now store a redacted Textual Gradient summary instead of failure clusters or prompt directions.
- PM Review disables Generate Candidate and Generate Suggestions for those protected comparisons.
- Background generation APIs reject candidate or suggestion generation from Holdout-protected tuning comparisons.
- Issues document was updated because the Textual Gradient overfit risk is now mitigated by Holdout redaction, non-mutating artifacts, and promotion gates.

2026-05-24 Prompt Program Suggestions update:

- Experiment Lab now asks a saved BYOK provider to generate read-only Prompt Program Suggestions from a comparison's Textual Gradient.
- Suggestions are persisted in `promptProgramSuggestions` with prompt patch, rubric, or schema categories and displayed under the comparison.
- Suggestions intentionally do not mutate the active prompt, AI Check contract, rubric, schema, release decisions, or promotion state.
- Issues document was updated because richer rubric/schema suggestion generation moved from open to implemented as a non-mutating PM artifact. Design document was updated to document the artifact boundary.

2026-05-24 Prompt Program Suggestion review update:

- Prompt Program Suggestion items now carry `proposed`, `accepted`, or `rejected` review state.
- Experiment Lab lets PM accept or reject individual suggestion items.
- Accepted items are tracked as contract-first implementation inputs without mutating the active prompt, AI Check contract, rubric, schema, release decisions, or promotion state.
- Issues document was updated because the contract-first workflow now has an explicit PM review handoff. Design document was updated to include suggestion item review state.

2026-05-24 Contract-first backlog update:

- Contract Reference now shows accepted Prompt Program Suggestions as a contract-first backlog.
- The backlog surfaces source comparison ids and reminds implementers to update `ai-check-contract.json`, generated contract references, eval assertions or fixtures, and linked docs.
- Issues document was updated because accepted suggestions now have a visible contract-work queue. Design document was updated to include the backlog in Contract Reference.

2026-05-24 Contract Change Plan update:

- Contract Reference now lets PM create a `ContractChangePlan` from an accepted Prompt Program Suggestion.
- Plans are persisted in `contractChangePlans`, linked back to the accepted suggestion item, and display target areas plus required implementation surfaces in the Contract-first backlog.
- Plans are intentionally non-mutating: applying a suggestion still requires an explicit code/doc change beginning with `apps/extension/src/shared/ai-check-contract.json`.
- Issues document was updated because the stale-contract risk now has a tracked plan artifact. Design document was updated to define the artifact boundary and status semantics.

2026-05-24 Contract Change Plan lifecycle update:

- Contract Reference now lets PM mark a Contract Change Plan as ready, applied, or rejected.
- Applied plans require an implementation note and store the current prompt, output schema, and evaluation schema versions as handoff evidence.
- Issues document was updated because applied status now has explicit evidence fields, while remaining intentionally unable to mutate or verify source-code changes by itself.

2026-05-24 Contract Change Plan evidence update:

- Applied plans now require structured evidence that contract source, generated references, eval assertions or fixtures, linked docs, and validation were handled.
- Contract Reference exposes the applied-evidence checklist and validation-summary field next to each plan.
- `updateContractChangePlan` rejects applied status unless all evidence fields are complete.
- Issues document was updated from open to partially mitigated because the stale-contract risk gained a stronger product guard, while true source verification still depended on the normal implementation and validation gates.

2026-05-24 Contract Change Plan version gate update:

- Contract Change Plans now persist `createdAgainstVersions` at plan creation.
- Applying a plan requires target-specific version changes since creation: prompt/rubric targets require a Prompt Program version change, schema targets require an output schema version change, and rubric/schema/evaluation targets require an evaluation schema version change.
- Contract Reference shows the baseline versions and required missing version updates before enabling `Mark Applied`.
- Issues document was updated because stale-contract risk moved from evidence-only mitigation to a version-gated workflow, and the already-implemented Experiment Lab and Candidate Prompt A/B risks now have enough product/test evidence to be marked mitigated. Design document was updated to capture the version baseline and apply gate.

2026-05-24 Prompt Console audit gate update:

- Added `npm --workspace apps/extension run audit:prompt-console`.
- The audit verifies linked design/progress/issues docs, AI Check contract ownership of Prompt Program rules, current-version eval fixtures, dataset/status separation, no runtime legacy eval migration, Contract Change Plan version gates, and E2E coverage markers for the Prompt Engineering Console workflow.
- `npm --workspace apps/extension run check:ai-check-contract` now runs the Prompt Console audit after generated contract and fixture validation, making Contract Reference drift a default contract-check failure.
- Issues document was updated because ISSUE-009 is now mitigated by a contract-check gate instead of only a standalone audit. Design document was checked; the contract-first product boundary still applies.

2026-05-24 Prompt Program rubric contract update:

- `ai-check-contract.json` now includes `promptProgram.decisionPolicyRules` and `promptProgram.scoringRules`.
- `generate-ai-check-contract.mjs` exports those rules as generated TypeScript constants.
- `prompt.ts` injects decision policy and scoring rules from generated contract constants instead of hard-coded prompt text.
- Contract Reference has a Prompt Program tab that shows the same contract-backed decision policy and scoring rules.
- Issues document was updated because Contract Reference now covers the prompt rubric/policy surface directly.

2026-05-24 Prompt Program version semantics update:

- The stored field remains `promptVersion` to stay compatible with the existing contract and project conventions.
- Contract docs and PM Review now label its product meaning as Prompt Program Version, covering the full system prompt, decision policy, scoring rubric, prompt-facing schema, parser contract, and fallback behavior.
- Design document was updated to remove the earlier ambiguity that `promptVersion` might mean only static prompt text.

2026-05-24 Evaluation input evidence schema update:

- `ai-check-contract.json` now points to `ai-check-evaluation-v4` and keeps v3 in the version registry as historical.
- Evaluation schema v4 adds optional `eval.expectedInputEvidence.hasExplicitDuration` and `eval.expectedInputEvidence.hasReturnPlan`.
- All active eval fixtures were migrated to evaluation schema v4.
- The homework missing-boundary case now asserts missing duration and return-plan evidence; the TypeScript build-error case now asserts both are present.
- Shared UI/provider evals and CLI evals both check expected input evidence from case messages.

2026-05-24 Expected input evidence authoring update:

- `CreateEvalCaseInput` and `UpdateEvalCaseInput` now accept `expectedInputEvidence`.
- `review-store` persists expected input evidence during case creation/update and preserves it during stored-case normalization.
- Evaluation Case editor exposes explicit duration and return-plan evidence expectations as Ignore/Yes/No controls.
- E2E now verifies authored eval cases persist expected input evidence.

2026-05-24 Contract Reference and snapshot-source polish:

- PM Review top-level navigation now uses `Contract Reference`, matching the Prompt Engineering Console area model.
- History review exposes the selected decision point's snapshot source as `Runtime` for persisted runtime snapshots or `Derived` for deterministic fallback snapshots.
- Bad-case reviews now store the snapshot source used at review time.
- E2E now verifies the Runtime snapshot source affordance before converting a reviewed decision point.

2026-05-24 Case Library origin affordance update:

- Case Library now has a Case origin filter for all origins, built-in defaults, authored cases, real-session cases, and PM-review cases.
- Evaluation case list and detail now show provenance badges plus a built-in default badge for bundled fixture ids.
- Built-in default detail explains that edits and archives become local overrides instead of mutating bundled fixture source.
- E2E now verifies built-in default filtering and guidance.

2026-05-24 Experiment Workspace update:

- Experiment Lab now persists named Experiment Workspaces in `experiments`.
- Workspaces store explicit arms and link existing run, comparison, Prompt Program Suggestion, release decision, and promotion artifact ids instead of duplicating those records.
- This implements a first multi-run/multi-artifact management layer while keeping eval run, comparison, suggestion, release, and promotion records as the authoritative evidence.
- Design document was updated to describe the implemented workspace artifact model.

## Update Checklist

When this progress doc changes, check:

- Design doc: did the operating model, phases, or locked decisions change?
- Issues doc: should risks or blockers be added, closed, or reprioritized?
- PM Review workspace docs: did implementation status change in the existing workspace?
- AI Check contract docs: did schema/source/version rules change?
