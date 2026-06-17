
## F3 Final Manual QA — 2026-06-16 19:01

VERDICT: APPROVE. All 5 scenarios PASS.

- S1 Concurrent first-login: ensure-user-exists.test.ts 6/6 PASS incl. N=5 high-concurrency (all 5 resolve, Set(ids).size===1, exactly 1 row). Zero P2002 escapes.
- S2 Unauthenticated accept: live curl POST /invitations/accept (no auth) -> 401 AUTHENTICATION_REQUIRED. Gateway live at :7700.
- S3 Authenticated accept: invitation-accept.test.ts 7/7 PASS (401/no-user-create/idempotent/restore/403/410-expired/410-used).
- S4 E2E data: task-5-happy.json 6/6 checks (accept 200, /me 200, /me/tenants 200 w/ VLRE, user_row_count=1, single_creator=PASS).
- S5 Single-creator invariant: admin-invitations.ts accept handler — NO user.create/upsert/tx.user calls; uses req.auth!.id (line 333); authMiddleware+requireAuth mounted (line 286); membership-only ops.

GOTCHA: `pnpm test:integration -- <filter>` does NOT filter by filename — vitest runs the FULL suite (454 tests) and the trailing arg is ignored. To isolate target files, invoke vitest directly with explicit file paths:
  pnpm exec vitest run --config vitest.integration.config.ts tests/integration/auth/ensure-user-exists.test.ts tests/integration/auth/invitation-accept.test.ts --reporter=verbose
Isolated run: 2 files, 13/13 PASS in 1.84s.

NOTE: Full-suite run surfaced 2 UNRELATED pre-existing failures (jira-webhook.test.ts, manual-trigger.integration.test.ts) — not in the invitation accept path; do not block on them.
