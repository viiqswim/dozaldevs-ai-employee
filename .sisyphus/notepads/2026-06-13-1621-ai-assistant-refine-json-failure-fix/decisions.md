# Decisions

## [2026-06-13] Session Init

- Confirm-understanding step is ADDITIVE — does not alter existing diff/approve/revert flow
- Restatement is plain text (not JSON) — immune to parse bug
- No persisting chat transcripts or restatements (ephemeral by design)
- No ambiguity-gating — confirm step always runs before diff generation
- repairJsonStrings helper must be pure and exported for unit testing
- No third-party json-repair deps unless simple newline-escape is proven insufficient
