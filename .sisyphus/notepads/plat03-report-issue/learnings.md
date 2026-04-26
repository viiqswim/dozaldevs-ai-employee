# Learnings — plat03-report-issue

## Shell Tool Conventions (confirmed)

- Zero npm imports — use native `fetch` only (hostfully pattern)
- Manual `for` loop arg parsing — no yargs/commander/minimist
- `--help` Pattern B: flag returned, checked at top of `main()`
- stdout: `process.stdout.write(JSON.stringify(result) + '\n')` only
- stderr: `Error:` (fatal, exit 1), `Warning:` (non-fatal, continue), `Fatal:` (catch block)
- Entry: `main().catch((err) => { process.stderr.write('Fatal: ' + String(err) + '\n'); process.exit(1); })`
- Reference: `src/worker-tools/hostfully/get-messages.ts` for full structure

## Prisma Conventions (confirmed)

- UUID PK: `@id @default(uuid()) @db.Uuid`
- Tenant FK: `tenant_id String @db.Uuid` + `@relation(onDelete: Restrict)`
- Timestamps: `created_at DateTime @default(now())` — no `updated_at` for append-only log
- Boolean default: `Boolean @default(false)`
- Long text: `String @db.Text`
- Table name: `@@map("system_events")`
- Back-relation required on Tenant: `systemEvents SystemEvent[]`
- Migration: `pnpm prisma migrate dev --name add_system_events_table`
- No seed data, no GRANT statements, no RLS policies

## Docker Build (confirmed)

- PLAT-01 complete: `.ts` source files copied, tsx globally installed
- Dockerfile stanza: `RUN mkdir -p /tools/platform` + `COPY --from=builder /build/src/worker-tools/platform/report-issue.ts /tools/platform/report-issue.ts`
- NO npm install needed (zero imports)
- Placement: after hostfully COPY stanzas, before CMD

## Test Pattern (confirmed)

- `execFile` + `npx tsx` subprocess spawn
- Real `http.Server` on port 0 for mocking
- Both PostgREST routes (`/rest/v1/system_events`) AND Slack routes (`/chat.postMessage`) on same mock server
- Env vars: `SUPABASE_URL=http://localhost:${port}`, `SLACK_API_BASE_URL=http://localhost:${port}`
- Test file: `tests/worker-tools/platform/report-issue.test.ts`
- Reference: `tests/worker-tools/hostfully/get-messages.test.ts`

## PostgREST (confirmed)

- Headers: `{ apikey: key, Authorization: 'Bearer key', Content-Type: 'application/json', Prefer: 'return=representation' }`
- POST returns array of created records — `data[0].id` is the event ID
- No explicit GRANT needed — default privileges from existing migration cover new tables
- PostgREST may need restart after migration: `docker compose -f docker/docker-compose.yml restart postgrest`

## Key Decisions

- `task_id`: `String` (text), NOT uuid — intentional, not FK to tasks table
- TENANT_ID: added to machine env at employee-lifecycle.ts:213-219 (1 line)
- ISSUES_SLACK_CHANNEL: from env var, skip Slack with Warning if not set
- Slack failure: exit 0 + Warning (non-fatal)
- SLACK_API_BASE_URL: optional env var, defaults to `https://slack.com/api` — for test mock injection
