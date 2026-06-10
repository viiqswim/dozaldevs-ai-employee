# Issues — org-invitation-flow

## [2026-06-09] Known Issues (pre-existing, do NOT fix)

- DECLINE-vs-REVOKE error-code inconsistency in admin-invitations.ts — known, out of scope
- `removeMember` uses raw `fetch` instead of `gatewayFetch` — pre-existing inconsistency, out of scope

## F3 Live E2E QA — REJECT (2026-06-09 20:40)

**BLOCKER: invitation creation 500s on every request.**

`src/gateway/routes/admin-invitations.ts:182` — `db.tenantInvitation.findFirst({ where: { ..., deleted_at: null } })`
→ `PrismaClientValidationError: Unknown argument deleted_at`

The `tenant_invitations` table / `TenantInvitation` model has NO `deleted_at` column (by design — status transitions are the lifecycle; confirmed schema.prisma:565-585 + DB columns). The `deleted_at: null` filter must be removed from line 182. Status `'pending'` already scopes out superseded/revoked rows, so no soft-delete semantics are lost.

Impact: blocks Happy Path, Role Cap, Supersede (all depend on create). Failure-case lookups (404/404) pass; accepted-token 410 unreachable.

Evidence: `.sisyphus/evidence/final-qa/2026-06-09-2040-f3-live-invite-e2e.md`
