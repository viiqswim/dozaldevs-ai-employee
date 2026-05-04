# learnings.md — preflight-guest-messaging

## Script creation — 2026-05-03

### Conventions followed

- Shebang `#!/usr/bin/env tsx` + `$.verbose = false` at top — matches all other scripts in `scripts/`
- `loadEnv()` / `getEnv()` pattern copied verbatim from `scripts/trigger-task.ts` — no dotenv import
- Color palette `C` object copied verbatim from `scripts/trigger-task.ts`
- Section delimiter comments (`// ─── X ───`) adopted from `scripts/trigger-task.ts` style
- `ok/fail/warn/section/fixed` helpers mirror `scripts/trigger-task.ts` but `fail` and `ok` extended with optional `detail` param per spec
- PASS/FAIL/FIXED counters wrap helpers (`checkPass/checkFail/checkFixed`) — modeled on `scripts/verify-e2e.ts`
- Box-drawing header/footer matches `scripts/verify-e2e.ts` style

### API contracts confirmed

- `GET /admin/tenants/:id/secrets` → `{ secrets: Array<{ key, is_set, updated_at }> }` — must use `body.secrets ?? []`, NOT top-level array
- `PUT /admin/tenants/:id/secrets/:key` body: `{ value: "..." }` — X-Admin-Key header
- PostgREST queries need both `apikey` header AND `Authorization: Bearer` header
- Hostfully list: `GET /webhooks?agencyUid=...` header `X-HOSTFULLY-APIKEY` → `{ webhooks?: [...] }` — use `?? []`
- Hostfully register: `POST /webhooks` body has `agencyUid, eventType, callbackUrl, webhookType, objectUid`
- Gateway webhook receiver: `POST /webhooks/hostfully` → `{ ok: true, task_id }` or `{ ok: true, duplicate: true }`

### Runtime observations (live run, partial stack)

- tsx v4.21.0, node v22.21.1 — script compiles and runs with zero TypeScript errors
- Checks 1–6: env vars, docker, cloudflared, tunnel config, gateway health, tunnel reachable — run cleanly
- Checks 7–8: fail gracefully with "fetch failed" when PostgREST (localhost:54321) is down
- Check 9: skips auto-fix correctly when HOSTFULLY_API_KEY not in .env
- Check 11: skips correctly when HOSTFULLY_API_KEY/HOSTFULLY_AGENCY_UID missing
- Check 12: gateway returns HTML error (Prisma can't connect to DB) — script catches JSON parse error gracefully and reports checkFail
- Exit code 1 emitted correctly when failures present
- `--help` flag exits with code 0 and prints full usage

### Evidence

- `.sisyphus/evidence/task-1-tsx-check.txt` — tsx version check
- `.sisyphus/evidence/task-1-run-output.txt` — full run output with 16 structured elements verified
