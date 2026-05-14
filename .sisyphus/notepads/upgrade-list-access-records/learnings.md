# Learnings — upgrade-list-access-records

## [2026-05-14] Session Start

### Critical Sifely API Facts

- Login endpoint: `https://app-smart-server.sifely.com` (NOT pro-server)
- Sifely returns HTTP 200 even on auth failure — MUST check `body.code`
- `date: String(Date.now())` param MUST be rebuilt on every request — stale timestamps cause 500s
- The `/v3/lockRecord/list` endpoint uses POST with `application/x-www-form-urlencoded` body (NOT GET)

### Response Envelope Differences (CRITICAL)

- **Passcode endpoints** (`/v3/lock/listKeyboardPwd`): Return `{ list: [...] }` — NO `code` field on success
- **Access records endpoint** (`/v3/lockRecord/list`): Returns `{ code: 200, data: { total, pages, pageNo, pageSize, list: [...] } }` — ALWAYS has `code`
- This is WHY `assertListSuccess` (checks `code !== undefined`) works for passcodes but is WRONG for access records

### Import Convention

- Use `./lib/api.js` (ESM TypeScript convention) — 234 matches across codebase, ZERO `.ts` imports

### Record Types (from real API)

- `recordTypeFromLock=4` → Passcode unlock
- `recordTypeFromLock=13` → Failed attempt
- `recordTypeFromLock=20` → Fingerprint unlock
- `recordTypeFromLock=28` → Gateway/Remote unlock
- `recordTypeFromLock=47` → Auto-lock event

### Test Lock

- Lock ID: `24572672` (5306-kin-Home Front PERSONAL)
- Property: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
- Credentials: SIFELY_USERNAME=admin@vlrealestate.co in .env
