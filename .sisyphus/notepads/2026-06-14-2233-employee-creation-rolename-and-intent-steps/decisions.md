# Decisions — employee-creation-rolename-and-intent-steps

## 2026-06-15 Wave 1 execution plan

- T1 (Fix A: conditional prompt forbid) and T2 (Fix B: postProcess hardening) run in PARALLEL
- T3 (wizard pre-fill + live curl) runs after T1+T2 complete
- T4 (feasibility spike) runs in parallel with Wave 1
- Wave 2 (T5-T8) only if T4 PASSES
- Deterministic fallback slug: `'employee-' + Date.now().toString(36).slice(-4)` — short, always valid, never empty
- Comment removal from Fix B edit: T2 agent handles this (it's in the same file/block)
