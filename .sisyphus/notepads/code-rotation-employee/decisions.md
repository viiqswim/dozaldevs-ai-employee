# Decisions — code-rotation-employee

## [2026-05-13] Architectural Decisions

- **Architecture**: Replace vlre-hub engine entirely — AI employee uses tools directly, no vlre-hub dependency
- **Trigger**: Manual only via existing admin API endpoint — zero new trigger code
- **Approval**: `approval_required: false` — fully automated, auto-completes at Submitting→Done
- **Code generation**: Port exact memorable pattern logic from vlre-hub (mirror ABBA, rhythm ABAB, 4-6 digits)
- **Update strategy**: UPDATE passcode in-place (not delete+recreate) — use `update-passcode` action
- **Hostfully ordering**: Update PMS BEFORE updating physical locks
- **Concurrency**: `concurrency_limit: 1` — one rotation run at a time to prevent Sifely race conditions
- **Timeout**: `timeout_hours: 2` — sufficient for 50+ properties processed sequentially
- **Archetype ID**: `00000000-0000-0000-0000-000000000016`
- **Notification channel**: `C0960S2Q8RL` (VLRE ops channel)
- **Test property**: UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`, lock ID `24572672` ONLY
