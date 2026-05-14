# Issues — upgrade-list-access-records

## [2026-05-14] Known issues at session start

### Bug in current list-access-records.ts (to be fixed in T2)

1. Uses GET with query params — should be POST with form-encoded body
2. Hardcoded pageNo=1, pageSize=20 — no pagination
3. Strips recordTypeFromLock, username, hotelUsername, keyName in map()
4. --start-date and --end-date are mandatory — no defaults

### assertListSuccess bug (to be fixed with NEW function, not by modifying existing)

- Line 174-178 of api.ts: throws when `body.code !== undefined`
- But access records success response ALWAYS has `code: 200`
- Fix: create assertPaginatedListSuccess that checks `code !== 200`

### LSP ghost errors (PRE-EXISTING — ignore)

- src/worker-tools/locks/sifely-client.ts — file doesn't exist on disk (stale cache from restructure)
- src/worker-tools/sifely/sifely-client.ts — same issue
- src/worker-tools/locks/update-door-code.ts — same issue
- These are NOT real errors — do not attempt to fix
