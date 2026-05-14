# Decisions — upgrade-list-access-records

## [2026-05-14] Pre-execution decisions

### Do NOT modify existing symbols in api.ts

- `assertListSuccess` — MUST remain byte-for-byte identical (used by passcode tools)
- `SifelyListResponse<T>` — MUST remain byte-for-byte identical (used by list-passcodes, create-passcode, diagnose-access)
- Create NEW additive symbols: `SifelyPaginatedResponse<T>`, `assertPaginatedListSuccess`

### Pagination design

- Page size: 100 records per request (maximize throughput)
- Hard cap: 100 pages (10,000 max records) — stderr warning if hit
- `date: String(Date.now())` rebuilt on every page fetch (inside withRetry lambda)
- Each page wrapped in its own withRetry call

### --human flag behavior

- Additive: adds `recordTypeLabel: string` field to each record
- When flag absent: `recordTypeLabel` NOT present in output (backward compat)
- Label based on `recordTypeFromLock` (lock-side type), NOT `recordType` (server-side type)
- Fallback label: `Unknown (${recordTypeFromLock})`

### Date defaults

- `--start-date` optional: defaults to `Date.now() - 7 * 24 * 60 * 60 * 1000`
- `--end-date` optional: defaults to `Date.now()`

### diagnose-access.ts

- Has SAME bugs as list-access-records.ts (GET, wrong envelope, no pagination)
- Explicitly OUT OF SCOPE — separate follow-up plan needed

### Unit tests

- User explicitly said to SKIP — pre-existing failures unrelated to this work
