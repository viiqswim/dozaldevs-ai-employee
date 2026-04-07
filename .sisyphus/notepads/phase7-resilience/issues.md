# Phase 7 — Issues

## [2026-04-01] Session ses_2bab9c227ffe03nCP4j9oOJUYX — Initial

### Known Issues Going In

- callLLM() circuit breaker is reading 0 (estimated_cost_usd never written) → Task 4 fixes
- Tests that spyOn(console) will break after Task 6 migration → Task 1 enumerates, Task 6 fixes
- placeholder machine ID in lifecycle.ts → Tasks 3 + 11 fix
- redispatch.ts has no elapsed time check → Task 9 fixes
- waitForEvent has no pre-check → Task 8 fixes
