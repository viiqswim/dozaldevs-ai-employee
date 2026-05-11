
## Task 3 — Seed instruction update

- `leadUid` is on the **thread object** (top-level array item from `get-messages.ts`), not on individual message objects within a thread
- The instruction in `VLRE_GUEST_MESSAGING_INSTRUCTIONS` at line ~318 was updated from "message objects" → "each thread object" to match the actual JSON structure
- `pnpm prisma db seed` is idempotent (upsert pattern) — safe to re-run without side effects
- DB verification: grep the psql output for the new phrase to confirm the upsert landed

## Task 2: threadUid fallback in delivery pre-parse (2026-05-11)

### What was done
Added defensive fallbacks in `src/workers/opencode-harness.mts` pre-parse block (lines ~440-464):
- `leadUid`: tries `parsed['leadUid']` first, then `parsed['lead_uid']`
- `threadUid`: tries `parsed['threadUid']`, then `parsed['thread_uid']`, then `deliverable.metadata.thread_uid`
- Emits `log.info` with `source: 'metadata-fallback'` when metadata fallback fires

### Key findings
- `deliverable` is fetched with `select=*` at line 410-413, so `deliverable.metadata` is available as `Record<string, unknown>`
- `post-guest-approval.ts` writes `thread_uid` to `/tmp/approval-message.json` which gets stored as `deliverables.metadata.thread_uid` via `extraMetadata` spread
- The metadata fallback is the most reliable source when the model writes incorrect/missing keys in the deliverable JSON

### Pattern used
```typescript
const deliverableMetadata = (deliverable.metadata ?? {}) as Record<string, unknown>;
const threadUidFromParsed = typeof parsed['threadUid'] === 'string' ? parsed['threadUid']
  : typeof parsed['thread_uid'] === 'string' ? parsed['thread_uid'] : '';
const threadUidFromMetadata = !threadUidFromParsed && typeof deliverableMetadata['thread_uid'] === 'string'
  ? deliverableMetadata['thread_uid'] : '';
const threadUid = threadUidFromParsed || threadUidFromMetadata;
```
# Learnings — fix-threaduid-delivery-bug

## Task 1: add threadUid to get-messages output, rename reservationId → leadUid

### Pattern: threadUid from env var, not API response
- Hostfully GET /messages API does NOT return threadUid per message
- THREAD_UID is injected as env var by the lifecycle from `tasks.raw_event.thread_uid`
- Webhook schema requires thread_uid (z.string().min(1)), so always present for webhook-triggered tasks
- Mock fixture uses hardcoded threadUid = "2f18249a-9523-4acd-a512-20ff06d5c3fa" (known test UUID)
- Live path uses `process.env['THREAD_UID'] ?? ''`

### Two call sites for threads.push()
- Single-lead path (--lead-id, ~line 268) and multi-lead path (~line 372) must be kept identical
- Both updated: reservationId → leadUid, added threadUid from env var

### Mock fixture outputs directly (no env var substitution)
- HOSTFULLY_MOCK=true path reads fixture JSON and outputs it verbatim
- THREAD_UID env var does NOT affect mock output — fixture must have hardcoded threadUid

### Build: pnpm build exits 0 after changes
### No stale reservationId refs in src/worker-tools/hostfully/ (grep exit 1 = no matches)
