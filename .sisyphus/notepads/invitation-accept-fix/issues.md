# Issues — invitation-accept-fix

## [2026-06-16] Root Cause (confirmed)

Two flaws:

1. Dual-write race: `ensureUserExists` (by supabase_id) AND public accept (by email) both create users rows → P2002 on `users.email @unique`
2. `ensureUserExists` not concurrency-safe: parallel first-login (/me + /me/tenants) both call it for a brand-new user → P2002 → 401

Olivia self-healed on reload (row already existed on retry) — strongest evidence the concurrent first-login race (flaw 2) is the recurring cause.
