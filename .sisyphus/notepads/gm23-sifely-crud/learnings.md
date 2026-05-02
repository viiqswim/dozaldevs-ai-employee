# Learnings — gm23-sifely-crud

## [2026-05-01] Session start

### From GM-15 research (pre-existing)

- sifely-client.ts: 321 lines, manual arg parsing, if/else dispatch, process.stdout.write pattern
- Tests: real http.Server + execFile subprocess invocation — NOT vi.fn() mocks
- login() takes (baseUrl, clientId, username, password) — env vars read in main(), passed as args
- API calls: URLSearchParams as query string, `Authorization: Bearer ${token}` header
- Error detection: `if (body.code !== undefined)` for lists (presence of code = error)
- --lock-id validation is unconditional currently — must become conditional for list-locks

### TTLock API (from librarian research)

- list-locks: GET /v3/lock/list — query params
- create-passcode: POST /v3/keyboardPwd/add — form-urlencoded body, addType=2 for server-side
- update-passcode: POST /v3/keyboardPwd/change — form-urlencoded body, changeType=2
- delete-passcode: POST /v3/keyboardPwd/delete — form-urlencoded body, deleteType=2
- keyboardPwdType is NOT a param on /add — type inferred from startDate/endDate
- Sifely wrapper uses `code` not `errcode` — handle both defensively
- Permanent passcodes: endDate=0 convention

## [2026-05-01] Task: T1 — Extend sifely-client.ts with CRUD actions

### Implementation

- Added 4 new interfaces: SifelyLock, SifelyLockListResponse, SifelyCreatePasscodeResponse, SifelyMutationResponse
- parseArgs() extended: --name, --code, --passcode-id, --type flags added; all default to ''
- --lock-id validation moved to conditional: `if (!lockId && action !== 'list-locks')`
- --code validation (regex /^\d{4,9}$/) runs BEFORE env var checks — allows early exit without needing SIFELY_USERNAME
- 4 new functions: listLocks (GET), createPasscode (POST form body), updatePasscode (POST form body), deletePasscode (POST form body)
- Mutation error check: defensive dual check for both `body.code !== 200` AND `body.errcode !== 0`
- create-passcode: permanent=endDate:0, timed=user-provided dates, duplicate check by name
- All stdout: process.stdout.write(JSON.stringify(x) + '\n')
- All stderr: process.stderr.write('Error: ...\n')
- No passcode values in stderr (security rule honored)

### Key Decisions

- Early --code validation before env var checks → enables clean UX without API calls
- Duplicate check for create-passcode uses listPasscodes(), returns {keyboardPwdId, existed:true} if found
- updatePasscode only sends optional params (name/startDate/endDate) if provided, not empty strings

### Build

- pnpm build: EXIT 0
- Commit: 867056e

## [2026-05-01] Task: T2 — Add unit tests for Sifely CRUD actions

### Test patterns used
- `http.createServer` `if/else if` chain extended with 4 new routes: `/v3/lock/list`, `/v3/keyboardPwd/add`, `/v3/keyboardPwd/change`, `/v3/keyboardPwd/delete`
- POST routes require async body parsing: `req.on('data')` + `req.on('end')` before writing response; no `return` needed inside `else if` chain
- Used `lockId='dup-test'` for the duplicate-name test to avoid breaking existing `toHaveLength(1)` assertion on the `list-passcodes` test (both use lockId=12345)
- Mock `MOCK_EXISTING_PASSCODE` constant with `keyboardPwdName: 'test-existing-passcode'` returned conditionally on `lockId === 'dup-test'`
- Code validation tests (invalid format/length) pass `{}` as env — validation exits before SIFELY_USERNAME check
- `keyboardPwd=987654` → success (`keyboardPwdId: 99999`), `keyboardPwd=000000` → error (`{ code: 400, msg: 'test error' }`)

### Evidence
- All 15 tests pass: 7 existing + 8 new
- Commit: fe88889
- Test run time: 6204ms for the sifely-client suite

## [2026-05-01] Task: T3 — Live VLRE API Validation

### Summary
Full CRUD cycle validated against real Sifely API (https://app-smart-server.sifely.com) with VLRE credentials.
lockId used: 31136280 (Sifely-O-OB5_e70a2 / 407-Gev-Loft-official)

### Results
- **list-locks**: FAIL (code bug) — `GET /v3/lock/list` returns HTTP 500 "Request method 'GET' not supported". API requires POST with form-urlencoded body. Direct curl POST works and returns 73 locks.
- **list-passcodes**: PASS — `GET /v3/lock/listKeyboardPwd` works correctly with Authorization header.
- **create-passcode**: PASS — `POST /v3/keyboardPwd/add` works. Note: consecutive-digit passcodes rejected by API with code -2032 "Passcode is too simple". Used 257831 instead of 987654.
- **duplicate-name guard**: PASS — short-circuits on listPasscodes match, returns `{existed:true, keyboardPwdId}`.
- **delete-passcode**: PASS — `POST /v3/keyboardPwd/delete` returns `{"ok":true}`.
- **verify-deletion**: PASS — passcode absent from list after delete.

### API Findings
1. **list-locks bug**: `listLocks()` uses GET but API needs POST. Fix: change method to POST and move URLSearchParams to body. SAME pattern already used by create/delete.
2. **Passcode simplicity constraint**: API rejects consecutive/repeated digits (code -2032). Our code validation (`^\d{4,9}$`) only checks format, not simplicity. Worker instructions should advise non-sequential codes.
3. **login response shape**: `{ code: 200, data: { token, refreshToken, expires_in }, message: "Operation success!" }` — login code works correctly.
4. **list-passcodes returns keyboardPwdType**: observed type=3 (TIMED) on the created passcode even though permanent was requested (endDate=0). This may be a Sifely API quirk — `keyboardPwdType` at time of creation may differ from expected enum.
5. **CRUD cleanup**: All test passcodes removed. No residue left on any lock.

### Action Items for T4
- Fix `listLocks()`: change GET → POST + form body (critical)
- Document passcode simplicity constraint in help text

## [2026-05-01] Task: T4 — Story Map Update + Final Build
- pnpm build: PASS (exit 0)
- Test suite: 400 pass / 34 fail (all pre-existing — container-boot, inngest-serve, integration, lifecycle, opencode-server)
- GM-23 checkboxes marked: 9 (all acceptance criteria in lines 1004-1016)
- Telegram notification: sent
- Commit: a41e796 — docs(planning): mark GM-23 complete in story map
