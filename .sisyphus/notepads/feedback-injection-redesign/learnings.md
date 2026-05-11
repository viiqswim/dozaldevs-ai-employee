# Learnings — feedback-injection-redesign

## Architecture Facts (verified from code reading)

- `employee-lifecycle.ts:31` — `MAX_LEARNED_RULES_CHARS = 8000` is the only existing constant
- Injection logic is at lines 502-602 of `employee-lifecycle.ts`
- Feedback table: `prisma/schema.prisma:143-162` — no `consolidated_at` column yet
- LearnedRule model at `prisma/schema.prisma:494-513` — has `confirmed_at DateTime? @db.Timestamptz(6)` — use same pattern
- Feedback is tenant-scoped (no archetype_id column) — injection is tenant-wide
- Feedback summarizer: `src/inngest/triggers/feedback-summarizer.ts` — 388 lines, weekly cron `0 0 * * 0`
- Slack handlers for rules: `src/gateway/slack/handlers.ts:970-1214`
- Harness consumes `FEEDBACK_CONTEXT` and `LEARNED_RULES_CONTEXT` env vars at lines 529-537

## DB Connection

- `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee`
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- Guest-messaging archetype ID: `00000000-0000-0000-0000-000000000015`

## Patterns

- PostgREST null check: `consolidated_at=is.null` (not `is null`)
- PostgREST batch update: `?id=in.(id1,id2,id3)` for multiple rows
- Logger: `createLogger('module-name')` — never console.log in production code
- No `as any` or `@ts-ignore` allowed
