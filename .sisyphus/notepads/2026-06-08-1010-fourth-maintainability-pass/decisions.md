# Decisions — Fourth Maintainability Pass

## [2026-06-08] Scope decisions (from user interviews)

- mergeTaskMetadata: STANDARDIZE all 6 sites (documented behavior change — always .ok-check + structured warn)
- SMELL-7: FULLY externalize to tenant config, proven byte-identical
- Config widening: NARROW — only call-llm + interaction-classifier; encryption.ts EXCLUDED
- Test vs decompose order: DECOMPOSE FIRST, then test new shape
- Backend decomposition: ALL 5 files (extract-only)
- Test coverage: FULL — all 8 untested lifecycle steps
- Docs: DEDICATED final wave; FULL template set
