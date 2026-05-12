# BetterMe Agent Instructions

## Project Docs

- `docs/` is the canonical location for project documentation.
- Do not create a separate `doc/` working-docs path.
- Design documents live under `docs/design/`.
- Every file under `docs/design/` must include the date in `YYYY-MM-DD` format at the start of the filename.
- Use clear suffixes:
  - `YYYY-MM-DD-<topic>-design.md`
  - `YYYY-MM-DD-<topic>-progress.md`
  - `YYYY-MM-DD-<topic>-issues.md`
- For a design topic, maintain three linked documents:
  - `design`: product intent, high-level architecture, state model, behavioral rules, implementation strategy.
  - `progress`: what is done, what is in progress, what remains, validation status.
  - `issues`: known bugs, open questions, risks, repro notes, decision blockers.
- The three documents must reference each other near the top.
- When updating any one of the three documents, check the other two and update them if the change affects scope, status, risk, or implementation order.
- If only one document changes after the check, note why the other two did not need updates.

## BetterMe Product Direction

- Treat BetterMe as a privacy-first Chrome MV3 extension.
- Keep long-term blocked targets separate from temporary access state.
- Do not treat license unlock, AI readiness, temporary unlock, cooldown, and block hold as the same concept.
- Prefer explicit state derivation over scattered UI conditionals.
