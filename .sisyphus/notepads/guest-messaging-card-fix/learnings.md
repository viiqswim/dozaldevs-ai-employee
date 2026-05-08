# Learnings — guest-messaging-card-fix

## 2026-05-08 Init
- `block_id: 'papi-chulo-daily-summary'` in post-message.ts line 56 MUST stay unchanged — read-channels.ts:54 isSummaryPost() depends on it
- serve.ts is at `src/gateway/inngest/serve.ts` (NOT src/inngest/serve.ts)
- Guest-messaging archetype ID: `00000000-0000-0000-0000-000000000015`
- Stuck task ID: `86b0e86c-b6cc-4f97-805a-fce0d7d2086a` (status: Reviewing)
- DB: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee
