# Learnings — invitation-accept-fix

## [2026-06-16] Task 1: Olivia Production Diagnosis

- Olivia's records are ALREADY FULLY CONSISTENT — she self-healed on a retry
- Single `users` row: `id=4a1268f4-0073-4fe2-9a1d-df80104f3829`, `supabase_id=c0654937-ed35-417e-805c-697215d7f6aa`, `status=active`
- Live `tenant_memberships` for tenant `00000000-0000-0000-0000-000000000003` (VLRE), role `ADMIN`, `deleted_at=null`
- Invitation: `accepted`
- Task 6 is confirm-only — no write expected

## Key Architecture Facts

- `ensureUserExists` is at `src/gateway/services/ensure-user-exists.ts` — plain `upsert` keyed on `supabase_id`, NO P2002 handling
- `authMiddleware` calls `ensureUserExists` at line 43; swallows errors → 401 at lines 52-54
- `/invitations/accept` is currently PUBLIC (no auth) and creates user rows inline (lines 325-349)
- `users.email` is `@unique` — concurrent inserts collide with P2002
- `TenantMembership` composite PK `(tenant_id, user_id)` has NO `deleted_at` — restore via `deleted_at = null`
- `isPrismaError` helper in `src/gateway/lib/prisma-helpers.ts` for narrow P2002 detection
- `UserRepository` at `src/repositories/user-repository.ts` has `findBySupabaseId`, `findByEmail`, `restore`
- `getSupabaseUserIdByEmail` has 3 call sites: accept (line 339 — DELETE), set-password (line 460 — KEEP), invite-create (line 213 — KEEP)
- Frontend: `AuthContext` writes token to localStorage ASYNCHRONOUSLY — must pass token explicitly from `signInWithPassword`
- `acceptInvitation` in `dashboard/src/lib/gateway.ts` lines 573-578 — needs optional `accessToken` param
- `AcceptInvitePage.tsx` `handleSetPassword` lines 54-87 — capture token from `signInWithPassword`

## Test Infrastructure

- Integration tests: `pnpm test:integration` against `ai_employee_test` DB
- Setup test DB once: `pnpm test:db:setup`
- Existing concurrency test in `tests/integration/auth/ensure-user-exists.test.ts` (3-parallel model)
- Do NOT use `@example.com` emails in tests

## Constraints

- MUST NOT modify `ProtectedRoute.tsx` or `use-tenant.ts`
- MUST NOT add schema migration
- MUST NOT hard-delete (soft-delete only)
- MUST NOT change set-password (line ~460) or invite-create (line ~213) `getSupabaseUserIdByEmail` call sites
- MUST NOT add heal-on-login, takeover guard, or email-fallback reconciliation to `ensureUserExists`
- The narrow P2002-catch-and-refetch of the SAME identity IS required (Task 1c)
- `scripts/seed-platform-owner.ts` bootstrap is an accepted out-of-band exception to single-creator invariant

## F2 Code Quality Review (2026-06-16)

**Result: APPROVE** — Build EXIT 0, Lint EXIT 0, Unit 2116 pass / 9 skip, Integration 436 pass / 18 skip.

### Verified critical claims
- `getSupabaseUserIdByEmail` survives ONLY in create-handler (L215) + set-password (L450). **Absent from accept handler** (L286-393).
- Zero `user.create` / `user.upsert` / `tx.user` calls anywhere in admin-invitations.ts (grep clean).
- Accept handler is membership-only: `tenantMembership.create`/`update` + `tenantInvitation.update`. Uses `req.auth!.id` (authMiddleware-populated), email-mismatch guard (403), Serializable tx with P2034 retry (3x, 50/100ms backoff) → JSON 409 fallback.
- All responses via `sendError`/`sendSuccess`; `isPrismaError` for P2034 detection. No inline res.status().json().
- `acceptInvitation(token, accessToken?: string)` typed correctly; spreads Authorization header when token present.
- ensure-user-exists.ts: narrow P2002 catch, re-fetch by supabase_id then email, re-throws all else. No `as any`/`@ts-ignore`/console/empty-catch in any changed file (grep clean).

### Tests are real
- ensure-user-exists.test.ts: 6 tests incl. genuine N=5 Promise.all concurrency assertion (Set(ids).size===1, rows===1). Cleanup handles `concurrent-first-login-` prefix (L27-29).
- invitation-accept.test.ts: exactly 7 real scenarios (401 unauth, no-user-row-created, idempotent re-accept 200, soft-delete restore 200, email-mismatch 403, expired 410, already-used 410). Mocks verifySupabaseJwt.
- email-setup.md gotcha #3 rewritten — no line numbers, no volatile counts, no AI slop.

### Minor nit (non-blocking)
- `TxLike.user` type field (L44-47) is now unused dead type-surface since accept tx no longer touches tx.user. Does not fail lint/build. Trivial — not a rejection criterion.

### Evidence
- .sisyphus/evidence/final-qa/{f2-build,f2-lint,f2-tests,f2-integration,f2-summary}.txt
