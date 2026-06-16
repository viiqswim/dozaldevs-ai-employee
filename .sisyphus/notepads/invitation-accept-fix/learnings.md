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
