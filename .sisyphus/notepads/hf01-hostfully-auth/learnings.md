## Task 2: Hostfully env-loader test (2026-04-21)

- `loadTenantEnv()` generically uppercases ALL secret keys via `key.toUpperCase()` — no special handling needed for Hostfully keys
- `hostfully_api_key` → `HOSTFULLY_API_KEY`, `hostfully_agency_uid` → `HOSTFULLY_AGENCY_UID` confirmed working
- Test helpers (`makeTenant`, `makeDeps`) copied verbatim from `tenant-env-loader.test.ts` — pattern works cleanly
- `npx vitest run <file>` is faster than `pnpm test -- --run <file>` for single-file runs (avoids running all tests)
- Evidence dir `.sisyphus/evidence/` is gitignored — only commit the test file itself
- 5 tests: api_key mapping, agency_uid mapping, both together, tenant isolation, no-lowercase assertion

## Task 4: Build + Docker verification (2026-04-21)
- pnpm build: PASS (exit 0, no TypeScript errors)
- validate-env tests: 5/5 pass
- env-injection tests: 5/5 pass
- docker build: PASS (exit 0, ~10 min build time)
- docker image validation: PASS
  - /tools/hostfully/validate-env.js exists in image (1127 bytes)
  - exits 1 with stderr error when HOSTFULLY_API_KEY missing
  - exits 1 with stderr error when HOSTFULLY_AGENCY_UID missing
  - exits 0 with JSON {"ok":true,"apiKeySet":true,"agencyUidSet":true} when both present
- dist/ smoke test: PASS (same exit code behavior confirmed from compiled JS)
- Evidence saved to .sisyphus/evidence/ (task-4-build.txt, task-4-test-*.txt, task-4-docker-*.txt, task-1-validate-env-*.txt)

## Task 5: Store VLRE secrets (2026-04-21)
- hostfully_api_key stored: HTTP 200
- hostfully_agency_uid stored: HTTP 200
- VLRE secrets list: both keys present (hostfully_agency_uid, hostfully_api_key)
- DozalDevs isolation: no hostfully keys (secrets array empty)
- Plaintext leak check: CLEAN (responses contain only key, is_set, updated_at — no values)
- Evidence saved to .sisyphus/evidence/task-5-*.txt (4 files)
