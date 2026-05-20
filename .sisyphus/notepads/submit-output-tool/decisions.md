# Decisions — submit-output-tool

## 2026-05-20 Init
- Classification enum: NEEDS_APPROVAL | NO_ACTION_NEEDED (not APPROVED — matches existing schema)
- Section 7 keeps manual-write as fallback (not removed) — additive change only
- No mock mode — tool has zero API calls
- No harness changes — fatal throw is correct
- Only archetype update: real-estate-motivation-bot (DB-only via SQL)
- E2E consistency: 2 runs required
