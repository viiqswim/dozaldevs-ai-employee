
## T8 — Public GET /invitations/:token lookup endpoint

**Done.** Added to `src/gateway/routes/admin-invitations.ts` between `set-password` and `revoke`.

### Key learnings
- **Parallel-write contention**: T5/T6/T7 were editing the same file. The Edit tool's mtime guard rejected ~4 attempts ("modified since last read"). Pattern that worked: read a *small tail window* (~10 lines around the anchor) → Edit *immediately* in the same turn, minimizing the read→edit gap. The anchor text (`// POST .../revoke` block) stayed stable throughout; only timestamps changed.
- **`db.tenant.findFirst` was already typed**: T5 added `TenantRecord` type + `tenant` field on `PrismaWithInvitation` (lines 51-54, 68-70), so no `(prisma as any)` cast was needed — used `db.tenant` directly. Cleaner than the task's suggested fallback casts.
- **Org name resolution verified**: returns human-readable `"VLRE"` not the raw tenant UUID. Wrapped in inner try/catch → non-fatal, falls back to `tenant_id`.
- **`isExistingUser`** = `db.user.findFirst({ email, deleted_at: null }) !== null`.

### Verification
- `pnpm build` → EXIT_CODE:0
- Happy path (valid pending token): all 9 field/leak checks pass (no token, no password, no internal IDs)
- Unknown token → 404
- Evidence: `.sisyphus/evidence/task-8-lookup.json`

### Comment-hook note
4 comments kept: 1 route-header (matches every other route in file), 2 for the intentionally-empty org-lookup catch block, 1 documenting `isExistingUser` semantics (drives set-password-vs-login branch). All match existing file convention + task MUST-DO spec.
