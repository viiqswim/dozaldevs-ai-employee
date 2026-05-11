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
const threadUidFromParsed =
  typeof parsed['threadUid'] === 'string'
    ? parsed['threadUid']
    : typeof parsed['thread_uid'] === 'string'
      ? parsed['thread_uid']
      : '';
const threadUidFromMetadata =
  !threadUidFromParsed && typeof deliverableMetadata['thread_uid'] === 'string'
    ? deliverableMetadata['thread_uid']
    : '';
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

## Task 4: Docker image rebuild verification (2026-05-11)

### Build result

- `docker build -t ai-employee-worker:latest .` exits 0
- Image SHA: `sha256:656b11afa9de2c9281a492a5c87ad6014c28b5a1121daa7b8b020342f3a57dd6`
- Build took ~30s (layers cached from prior builds)

### Wave 1 changes confirmed baked in

- `grep -c "threadUid" /tools/hostfully/get-messages.ts` → 4 matches (PASS)
- `cat /tools/hostfully/fixtures/get-messages/default.json` → contains `threadUid` and `leadUid` (PASS)
- `pnpm build` (tsc) exits 0 — no TypeScript errors

### Dockerfile copies .ts source files directly (not compiled JS)

- Worker tools are TypeScript source files copied to `/tools/` and executed via `tsx` at runtime
- No compilation step needed for worker-tools — changes to `.ts` files are immediately reflected after rebuild

## Task 5: E2E Browser Verification (2026-05-11)

### Full flow confirmed working

- Airbnb message sent: "Can I bring my dog? [e2e-threaduid-fix-1778531812]"
- Task created: `cc6e9d1f-9a63-4c14-afff-97f804acbcc5`
- Lifecycle: Received → Executing (~1s) → Reviewing (~50s) → Done (~90s after approval)
- Approval card appeared in Slack `#cs-guest-communication` with "Approve & Send" button
- Click via `page.evaluate(() => button.click())` worked correctly
- Slack card updated to "Approved by @Victor Dozal — delivering now"
- Leo's reply delivered to Airbnb thread

### threadUid fix confirmed via DB deliverable

The deliverable content JSON had DISTINCT UUIDs:
- `"leadUid": "29a64abd-d02c-44bc-8d5c-47df58a7ab14"`
- `"threadUid": "aef3d0cf-bc61-4f05-a3ce-1a4199ca336d"` ← CORRECT (different from leadUid)

Before fix: both would have been `29a64abd-...` (leadUid repeated as threadUid).

### Container logs are ephemeral (--rm)

Docker workers run with `--rm`. Container logs not accessible after completion. Use DB deliverable record as primary evidence source for threadUid correctness. The `deliverable.content` JSON and `deliverable.metadata` both store thread_uid/threadUid persistently.

### Harness pre-parse path used (not fallback)

`parsed['threadUid']` was populated directly from the model output — the metadata-fallback branch (3rd tier) did not fire. Harness log would show `hasThreadId: true`.

### Thread URL for Slack

`https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S/thread/C0AMGJQN05S-{ts}` format does NOT always auto-open the thread. However, the approval card is visible in the channel view itself — no need to navigate to thread URL. The `evaluate` approach finds buttons by text content.

## Task 6 — Telegram Notification
- Use `npx tsx` instead of bare `tsx` when tsx is not in PATH
- Notification sent successfully: fix-threaduid-delivery-bug complete

## Task 4: Test file sync after reservationId → leadUid rename (2026-05-11)

### What was done
- Source code (`get-messages.ts`) correctly renamed `reservationId` → `leadUid` in `ThreadSummary` type and both `threads.push()` call sites
- Test files were not updated in the same commit, causing 8 test failures across 2 files

### Files updated
- `tests/worker-tools/hostfully/get-messages.test.ts` — 12 occurrences replaced (type annotations, `.map()` accessors, `.find()` predicates, `toHaveProperty()` assertions)
- `tests/worker-tools/hostfully/get-messages-lead-id.test.ts` — 4 occurrences replaced (same patterns)

### Pattern
When renaming a field in a TypeScript type/interface, always grep test files for the old field name before committing. Test files use the field name in:
1. Type cast annotations: `as { reservationId: string }[]`
2. Property accessors: `.map(t => t.reservationId)`
3. Find predicates: `.find(t => t['reservationId'] === ...)`
4. `toHaveProperty()` assertions: `expect(t).toHaveProperty('reservationId', ...)`

### Verification
- All 13 tests in `get-messages.test.ts` pass ✓
- All 11 tests in `get-messages-lead-id.test.ts` pass ✓
- `pnpm build` exits 0 ✓
