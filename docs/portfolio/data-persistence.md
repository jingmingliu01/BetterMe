# BetterMe Data Persistence

BetterMe is local-first in this public MVP.

## Where Data Lives

Chrome extension settings and product state use:

- `chrome.storage.local` for settings and local domain state.
- Extension IndexedDB for AI Check sessions, messages, decisions, review data, eval cases, eval jobs, eval runs, eval results, prompt comparisons, and local review artifacts.

Important IndexedDB stores include:

- `aiCheckSessions`
- `aiCheckMessages`
- `checkpointDecisions`
- `behaviorEvents`
- `patternMemories`
- `badCaseReviews`
- `evalCases`
- `evalJobs`
- `evalJobCaseStates`
- `evalRuns`
- `evalResults`
- `promptComparisons`
- `experiments`

## Why Eval Results Disappear After Reinstall

Chrome removes an extension's local storage and IndexedDB when the extension is uninstalled.

Because `evalRuns` and `evalResults` are local IndexedDB records, uninstalling and reinstalling BetterMe creates a fresh extension storage area. The previous local eval run history is gone unless it was exported before uninstall.

This is expected for the current public MVP.

## Current Recovery Options

The PM Review Experiment Lab can import a saved eval run artifact, and CLI/provider evals can write JSON artifacts for later import.

In-product local eval history is not currently synced to a backend.

## Future Production Direction

The private production roadmap separates local extension state from user-submitted feedback and future backend storage. The first production backend loop should upload only explicit user-submitted feedback, not raw local history.
