# Issues — gm15-smart-lock-diagnosis

## [2026-05-01] Known Issues / Gotchas

### Pre-existing Test Failures (Expected — NOT regressions)

- `container-boot.test.ts` — requires Docker socket; always fails in CI
- `inngest-serve.test.ts` — function count check expects old count
- `lifecycle.test.ts` — pre-existing failure
- `opencode-server.test.ts` — pre-existing failure

### Sifely API Gotchas

- HTTP 200 on auth failure — MUST check body.code
- List endpoints return `{ list: [...] }` with NO `code` field on success
- Presence of `code` field in response = error condition
- Auth endpoint: POST with query params, NOT JSON body

### Shared Lock Gotcha

- Lock 4831824 (271-GIN-FRONT-DOOR) shared by 5 properties
- Lock 5447540 (3401-BRE-FRONT-DOOR) shared by 4 properties
- Lock 5804542 (3412-SAN-FRONT-DOOR) shared by 5 properties
- Without passcode name filtering, tool would match wrong property's code
