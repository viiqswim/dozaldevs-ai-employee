# Issues & Gotchas — multi-tenancy-implementation

## [2026-04-16] Pre-flight Notes

- Do NOT use `z.string().uuid()` — it rejects system tenant UUID `00000000-0000-0000-0000-000000000001` due to RFC 4122 version bit enforcement. Use `UUID_REGEX` pattern already in `src/gateway/validation/schemas.ts`.
- Do NOT use `ON DELETE CASCADE` on tenant_id FK columns — use `RESTRICT` (defense-in-depth against accidental hard-delete)
- Do NOT seed TenantSecrets in seed.ts — Slack tokens come from OAuth or migration script only
- Server refuses to start without valid `ENCRYPTION_KEY` (64 hex chars) — must be set before starting
- `crypto.timingSafeEqual()` REQUIRED for HMAC comparison (timing-safe) — plain `===` comparison is a vulnerability
- Platform Migration A must pre-insert Platform tenant BEFORE T6 adds FK constraints (otherwise existing data breaks)
- `pnpm test -- --run` times out at 60s in this orchestrator; tests must be run inside tmux session for long-running checks
