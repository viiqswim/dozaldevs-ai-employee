# Learnings — code-rotation-employee

## [2026-05-13] Session Start

### Domain Model (CRITICAL)

- Property = Room (not a whole house)
- Locks are SHARED across properties — one physical lock, multiple named passcodes
- Passcode naming: `permanent-visitor-{type}[-{roomNumber}]`
  - HOME → `permanent-visitor-home`
  - ROOM → `permanent-visitor-room-N` (N = last numeric segment of property_name)
  - BUNDLE/MULTI_HOME → `permanent-visitor-bundle`
  - Custom override: `passcode_name` field on property_locks row (check first!)

### Shell Tool Conventions

- All tools: `parseArgs()` → `--help` → arg validation → env var validation → work → JSON stdout
- Errors to stderr, non-zero exit on failure
- No external npm deps — pure TypeScript
- Sifely API quirk: HTTP 200 on auth failure — MUST check `body.code`, not HTTP status
- List success omits `code` field entirely — presence of `code` = error

### Rotation Workflow (user-approved)

1. Generate memorable code (mirror/rhythm, 4-6 digits)
2. Update Hostfully door_code FIRST (before touching locks)
3. For each lock: UPDATE existing passcode in-place (not delete+recreate)
4. If no matching passcode exists (first-time): CREATE it
5. On shared locks: only touch passcode matching expected name

### Test Restriction (CRITICAL)

- ONLY test on: Hostfully UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
- ONLY test on: Sifely lock `5306-kin-Home Front (PERSONAL)` (lockId: 24572672)
- Do NOT touch any other property or lock until fully verified

### Key Files

- Source of truth for code gen: `/Users/victordozal/repos/real-estate/vlre-hub/apps/api/src/code-rotation/utils/code-generator.util.ts`
- Shell tool pattern: `src/worker-tools/locks/hostfully-door-code.ts`
- Existing Sifely tool: `src/worker-tools/locks/sifely-client.ts`
- Passcode name derivation already ported: `src/worker-tools/locks/diagnose-access.ts` lines 138–164
- Hostfully custom data: GET `/api/v3.2/custom-data?propertyUid={uid}` → find door_code field uid → PUT `/api/v3.2/custom-data/{entryUid}` with `{"text": "<code>"}`
- Approved model: `minimax/minimax-m2.7` only (CRITICAL — never use claude-sonnet/opus/gpt-4o)

## [2026-05-13] generate-code unit tests

### Direct Import Pattern

- `generate-code.ts` calls `main()` at module level (shell tool convention)
- When imported in vitest, `main()` runs synchronously (no awaits), writes one JSON line to stdout — harmless, vitest captures it
- Import with `.js` extension per project's NodeNext convention: `from '../../src/worker-tools/locks/generate-code.js'`
- All 7 pure functions (`generateMemorableCode`, `generateMemorableCodeWithMeta`, `isWeakCode`, `isValidCode`, `describeCode`) importable directly — no mocking needed

### Test Strategy

- Statistical property tests (N=50–200 iterations) work reliably for pattern existence — probability of false negative is negligible (~10^-15)
- Pattern consistency validated by checking ALL generated codes satisfy the union of valid patterns (ABBA || ABAB), not just sampling
- `generateMemorableCodeWithMeta` enables white-box pattern verification: assert code structure matches the reported pattern family
- `maxAttempts: 0` reliably forces the throw path without needing to exhaust the code space
- Invalid length at runtime (`3 as unknown as CodeLength`) causes TypeError from `GENERATORS[3]` being undefined — deterministic throw
- Test location: `tests/worker-tools/generate-code.test.ts` (not in `locks/` subdir per task spec)

### Result

- 40 tests, all pass, 11ms runtime
