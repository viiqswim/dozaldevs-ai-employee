## [2026-05-12] Session Start — fix-guest-name-source

### Root Cause (CONFIRMED VIA LIVE API TEST)

The Hostfully `GET /api/v3.2/leads/{uid}` API returns a WRAPPED response: `{ "lead": { guestInformation: { firstName: "Olivia", ... }, ... } }`.

Both `get-messages.ts` (line 247) and `hostfully-enrichment.ts` (line 56) cast the wrapper directly to `RawLead`/`RawLeadResponse` without unwrapping. This makes `guestInformation` undefined.

Evidence: `node -e` test returned `Top-level keys: [ 'lead' ]` — after unwrapping: `Lead firstName: Olivia`.

### Fix Pattern (ALREADY IN CODEBASE)

`hostfully-enrichment.ts` lines 74-78 already handles properties:

```typescript
const propertyJson = (await propRes.json()) as { property?: { name?: string }; name?: string };
const property = propertyJson.property ?? propertyJson;
```

Apply the same pattern for leads:

```typescript
const leadJson = (await leadRes.json()) as { lead?: RawLead };
const lead = leadJson.lead ?? (leadJson as unknown as RawLead);
```

### Backward Compatibility

Existing tests mock UNWRAPPED responses — they still pass because `?? rawJson` fallback handles the unwrapped case. New tests must mock the WRAPPED format to cover the actual production API shape.

### Deployment Paths

- `get-messages.ts` → `src/worker-tools/hostfully/` → Docker rebuild REQUIRED
- `hostfully-enrichment.ts` → `src/lib/` → Gateway auto-restarts (tsx watch), NO Docker rebuild

### Scope Boundaries

- ONLY the single-lead path at line 247 in `get-messages.ts` needs fixing
- Multi-lead path (line 310+) uses list endpoint `{ leads: [...] }` — already correct
- `get-reservations.ts` — list endpoint only — NOT affected
- `employee-lifecycle.ts` — DO NOT TOUCH
- `guest-message-poll.ts` — DO NOT TOUCH

### Test Files

- `tests/worker-tools/hostfully/get-messages-lead-id.test.ts` — add 1 wrapped-response test
- `tests/lib/hostfully-enrichment.test.ts` — add 1 wrapped-response test

### Known Pre-existing Test Failures (NOT regressions, do not fix)

- `container-boot.test.ts` — skips when Docker unavailable
- `inngest-serve.test.ts` — function count mismatch (stale assertion)

---

## [2026-05-12] E2E Task 5 — Scenario A Verification PASSED

**Task ID**: `4d3f7a49-0bc9-48c8-ad4f-ec00a5e2ba1a`

**Trigger**: Airbnb message "Is there parking nearby? [name-fix-e2e-1778611904]" sent from Olivia test account

**Result**: PASS ✅

### Confirmed values

| Check                                  | Value      | Status                            |
| -------------------------------------- | ---------- | --------------------------------- |
| `pending_approvals.guest_name`         | `"Olivia"` | ✅ (was "c.e. Wilson" before fix) |
| Slack approval card `Guest:` field     | `"Olivia"` | ✅                                |
| `deliverables.metadata->>'guest_name'` | `"Olivia"` | ✅                                |
| Task reached `Reviewing` state         | Yes        | ✅                                |

### Evidence files

- `.sisyphus/evidence/task-5-db-guest-name.txt` — psql output confirming `guest_name = Olivia`
- `.sisyphus/evidence/task-5-slack-approval-card.png` — screenshot of Slack thread with "Guest: Olivia"

### Infrastructure notes

- Cloudflare tunnel was not running at test start — had to start `cloudflared tunnel --config ~/.cloudflared/ai-employee-local.yml run` in tmux session `ai-tunnel`
- First Airbnb message ("Is there a gym nearby? [name-fix-e2e-1778611664]") was sent before tunnel was up, so webhook was missed
- Second message ("Is there parking nearby? [name-fix-e2e-1778611904]") triggered successfully after tunnel connected
- The `pnpm dev` tunnel is NOT auto-started when services are already running from a previous session
