# Sifely Tool Restructure

## TL;DR

> **Quick Summary**: Restructure the monolithic `src/worker-tools/locks/` directory into a proper `src/worker-tools/sifely/` service directory with shared library code, split the 666-line `sifely-client.ts` into 6 individual single-action tools, move misplaced Hostfully tools to `hostfully/`, fix convention violations (missing retry, timed passcode support), and update all references across the codebase.
>
> **Deliverables**:
>
> - New `src/worker-tools/sifely/` directory with `lib/api.ts` shared module + 8 tool files
> - 2 Hostfully tools moved to `src/worker-tools/hostfully/`
> - Updated Dockerfile, prisma/seed.ts, AGENTS.md, test files, and docs
> - All existing tests passing, Docker image rebuilt
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 8 waves
> **Critical Path**: T1 → T2 → T5-T10 → T12 → T15 → T18 → T24 → T25 → T26

---

## Context

### Original Request

Review all existing Sifely/lock tools against learnings from the 2026-05-13 passcode incident, reorganize the directory structure, split oversized files into small reusable tools with shared common code, and harden against future incidents.

### Interview Summary

**Key Discussions**:

- Directory rename: `locks/` → `sifely/` (matches service-based convention used by `slack/`, `hostfully/`, `platform/`)
- Split strategy: Fully replace `sifely-client.ts` with individual tools (no backward-compat wrapper)
- Shared code: Create `lib/api.ts` within `sifely/` for common auth, retry, interfaces, error helpers — justified exception to "no subdirectories" guideline
- Hostfully tools: `update-door-code.ts` and `hostfully-door-code.ts` belong in `hostfully/`, not `sifely/`
- Timed passcodes: Remove `--type timed` support entirely — permanent only

**Research Findings**:

- 26 references to `/tools/locks/` across 4 code files + docs
- `sifely-client.ts` (666 lines) — monolith with 6 actions, all in one file
- `diagnose-access.ts` (602 lines) — duplicates ~250 lines of Sifely API code from `sifely-client.ts`, missing `withRetry`
- `rotate-property-code.ts` (398 lines) — no retry on `runTool()` shell calls
- `rotate-property-code.ts` uses `path.join(__dirname, name)` — directory-agnostic, no changes needed for relative paths between sibling tools
- 5 test files need path updates: 3 in `tests/worker-tools/locks/`, 2 in `tests/worker-tools/`
- Dockerfile uses individual COPY per file (not bulk)
- `prisma/seed.ts` stores container paths in archetype `instructions` + `tools[]` arrays — DB must be re-seeded
- `create-passcode` in sifely-client.ts still supports `--type timed` which caused the original incident
- No mock fixture support (SIFELY_MOCK) in any tool — noted but out of scope for this plan

### Metis Review

**Identified Gaps** (addressed):

- Container path decision: RESOLVED — both source (`src/worker-tools/sifely/`) AND container (`/tools/sifely/`) paths change, requiring DB re-seed
- Output contract preservation: Added as acceptance criterion on every individual tool task — JSON output must match old `--action` behavior exactly
- Rollback safety: Seed idempotency verification added (run seed twice, second exits clean)
- `lib/` import paths in Docker: Verified — relative import `./lib/api.ts` from `/tools/sifely/list-locks.ts` resolves to `/tools/sifely/lib/api.ts` correctly
- Snapshot doc immutability: Verified — none of the 4 docs to update are in `docs/snapshots/`
- Test DB re-seed: Added `pnpm test:db:setup` step alongside `pnpm prisma db seed`
- `generate-code.ts` merge safety: Output contract must be preserved — `rotate-property-code.ts` parses its JSON stdout

---

## Work Objectives

### Core Objective

Restructure the Sifely tool directory from a monolithic layout into a clean, maintainable service directory with shared code, individual single-action tools, and correct directory placement — all without changing external behavior.

### Concrete Deliverables

- `src/worker-tools/sifely/lib/api.ts` — shared Sifely auth, retry, interfaces, error helpers
- `src/worker-tools/sifely/list-locks.ts` — standalone tool
- `src/worker-tools/sifely/list-passcodes.ts` — standalone tool
- `src/worker-tools/sifely/list-access-records.ts` — standalone tool
- `src/worker-tools/sifely/create-passcode.ts` — standalone tool (permanent only, with post-create type-2 verification)
- `src/worker-tools/sifely/update-passcode.ts` — standalone tool
- `src/worker-tools/sifely/delete-passcode.ts` — standalone tool
- `src/worker-tools/sifely/diagnose-access.ts` — rewritten to import from `lib/api.ts`
- `src/worker-tools/sifely/rotate-property-code.ts` — updated to call new individual tools + retry
- `src/worker-tools/sifely/generate-code.ts` — cleaned up (merge duplicate functions)
- `src/worker-tools/hostfully/get-door-code.ts` — moved from `locks/hostfully-door-code.ts`
- `src/worker-tools/hostfully/update-door-code.ts` — moved from `locks/update-door-code.ts`
- Updated: Dockerfile, prisma/seed.ts, AGENTS.md, 5 test files, 4 doc files

### Definition of Done

- [ ] `pnpm test -- --run` passes with same or better count as pre-refactor baseline
- [ ] `pnpm lint` passes with no new errors
- [ ] `pnpm build` compiles cleanly
- [ ] Docker image builds successfully
- [ ] Each new tool responds to `--help` with usage text (exit 0)
- [ ] `pnpm prisma db seed` runs cleanly (idempotent — second run also exits 0)
- [ ] No file exists at `src/worker-tools/locks/` (old directory fully removed)
- [ ] No file exists at `src/worker-tools/sifely/sifely-client.ts` (monolith deleted)

### Must Have

- Shared `lib/api.ts` with Sifely auth, `withRetry`, all interfaces
- Every individual tool follows shell tool checklist (`docs/guides/2026-05-04-1645-adding-a-shell-tool.md`): parseArgs, --help, env validation, JSON stdout, stderr errors
- `create-passcode.ts` must be permanent-only (no `--type timed`)
- `create-passcode.ts` must include post-create verification: list back the created passcode and confirm `keyboardPwdType === 2`
- `diagnose-access.ts` must use `withRetry` for Sifely API calls (was missing)
- `rotate-property-code.ts` must retry `runTool()` calls on transient failures
- Output contract preserved: each new tool produces identical JSON to the corresponding `--action` in old `sifely-client.ts`
- All Dockerfile COPY lines updated for new paths
- All prisma/seed.ts archetype instructions and tools[] arrays updated
- Database re-seeded after seed.ts changes

### Must NOT Have (Guardrails)

- **No timed passcode support** — `create-passcode.ts` must not accept `--type timed` or any start/end date params for timed codes
- **No SIFELY_MOCK support** — out of scope, defer to a separate plan
- **No changes to JSON output format** — each tool must produce byte-compatible JSON with the old `--action` equivalent
- **No edits to `docs/snapshots/`** — immutable by convention
- **No changes to `generate-code.ts` output format** — `rotate-property-code.ts` parses its stdout
- **No changes to `lib/api.ts` scope beyond what's needed** — only auth, retry, interfaces, error helpers. No business logic.
- **No `lib/index.ts` barrel export** — each tool imports what it needs directly from `./lib/api.ts`
- **Live API testing ONLY on designated test lock** — lock ID `24572672` (5306-kin-Home Front PERSONAL) on property `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`. Do NOT interact with any other lock or property during testing. This is a PERSONAL lock for testing — real guest locks must never be touched.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — update existing tests to match new paths, add basic smoke tests for new tools)
- **Framework**: vitest (existing)
- **Approach**: Run existing test suite after refactoring, fix broken paths, ensure parity

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI tools**: Use Bash — run tool with `--help`, run with missing args, verify JSON output shape
- **Docker**: Use Bash — `docker run --rm` to verify tools exist at correct container paths
- **Database**: Use Bash — verify seed idempotency, check archetype instructions contain new paths

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — directory rename):
└── Task 1: Rename locks/ → sifely/ via git mv [quick]

Wave 2 (After Wave 1 — foundation, 3 PARALLEL):
├── Task 2: Create sifely/lib/api.ts — shared Sifely code [unspecified-high]
├── Task 3: Move Hostfully tools to hostfully/ [quick]
└── Task 4: Clean up generate-code.ts [quick]

Wave 3 (After Task 2 — individual tools + diagnose rewrite, 7 PARALLEL):
├── Task 5: Create list-locks.ts [quick]
├── Task 6: Create list-passcodes.ts [quick]
├── Task 7: Create list-access-records.ts [quick]
├── Task 8: Create create-passcode.ts [quick]
├── Task 9: Create update-passcode.ts [quick]
├── Task 10: Create delete-passcode.ts [quick]
└── Task 11: Rewrite diagnose-access.ts [unspecified-high]

Wave 4 (After Wave 3 + Task 3 — dependent rewrites):
└── Task 12: Rewrite rotate-property-code.ts + delete sifely-client.ts [unspecified-high]

Wave 5 (After Wave 4 — references + tests, 5 PARALLEL):
├── Task 13: Update + move test files [unspecified-high]
├── Task 14: Update Dockerfile [quick]
├── Task 15: Update prisma/seed.ts [quick]
├── Task 16: Update AGENTS.md [quick]
└── Task 17: Update documentation files [quick]

Wave 6 (After Wave 5 — integration):
└── Task 18: Re-seed DB + Docker rebuild + full test suite [deep]

Wave 7 (After Wave 6 — live API tests, read-only + standalone, 5 PARALLEL):
├── Task 19: Live test list-locks.ts [quick]
├── Task 20: Live test list-passcodes.ts [quick]
├── Task 21: Live test list-access-records.ts [quick]
├── Task 22: Live test generate-code.ts [quick]
└── Task 23: Live test diagnose-access.ts [unspecified-high]

Wave 8 (After Wave 7 — live API tests, mutation tools, SEQUENTIAL):
├── Task 24: Live test create-passcode.ts [quick]
├── Task 25: Live test update-passcode.ts (depends: T24) [quick]
└── Task 26: Live test delete-passcode.ts (depends: T25) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Task 27: Notify completion via Telegram
```

### Dependency Matrix

| Task | Depends On   | Blocks     | Wave |
| ---- | ------------ | ---------- | ---- |
| T1   | —            | T2, T3, T4 | 1    |
| T2   | T1           | T5-T11     | 2    |
| T3   | T1           | T12        | 2    |
| T4   | T1           | —          | 2    |
| T5   | T2           | T12        | 3    |
| T6   | T2           | T12        | 3    |
| T7   | T2           | T12        | 3    |
| T8   | T2           | T12        | 3    |
| T9   | T2           | T12        | 3    |
| T10  | T2           | T12        | 3    |
| T11  | T2           | T13        | 3    |
| T12  | T3, T5-T10   | T13-T17    | 4    |
| T13  | T4, T11, T12 | T18        | 5    |
| T14  | T12          | T18        | 5    |
| T15  | T12          | T18        | 5    |
| T16  | T12          | T18        | 5    |
| T17  | T12          | T18        | 5    |
| T18  | T13-T17      | T19-T23    | 6    |
| T19  | T18          | T24        | 7    |
| T20  | T18          | T24        | 7    |
| T21  | T18          | T24        | 7    |
| T22  | T18          | —          | 7    |
| T23  | T18          | —          | 7    |
| T24  | T19-T21      | T25        | 8    |
| T25  | T24          | T26        | 8    |
| T26  | T25          | F1-F4      | 8    |

### Agent Dispatch Summary

- **Wave 1**: **1** — T1 → `quick`
- **Wave 2**: **3** — T2 → `unspecified-high`, T3 → `quick`, T4 → `quick`
- **Wave 3**: **7** — T5-T10 → `quick`, T11 → `unspecified-high`
- **Wave 4**: **1** — T12 → `unspecified-high`
- **Wave 5**: **5** — T13 → `unspecified-high`, T14-T17 → `quick`
- **Wave 6**: **1** — T18 → `deep`
- **Wave 7**: **5** — T19-T21 → `quick`, T22 → `quick`, T23 → `unspecified-high`
- **Wave 8**: **3** — T24-T26 → `quick` (sequential)
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Rename `locks/` → `sifely/` directory

  **What to do**:
  - Run `git mv src/worker-tools/locks/ src/worker-tools/sifely/`
  - Verify all 6 files moved: `sifely-client.ts`, `diagnose-access.ts`, `rotate-property-code.ts`, `generate-code.ts`, `update-door-code.ts`, `hostfully-door-code.ts`
  - Do NOT update any references yet — just the directory rename

  **Must NOT do**:
  - Do not rename individual files yet
  - Do not update Dockerfile, seed.ts, AGENTS.md, or tests — that's later waves
  - Do not create new files yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: T2, T3, T4
  - **Blocked By**: None

  **References**:
  - `src/worker-tools/locks/` — current directory with 6 files to move

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Directory renamed successfully
    Tool: Bash
    Steps:
      1. Run `ls src/worker-tools/sifely/` — expect 6 .ts files
      2. Run `ls src/worker-tools/locks/ 2>&1` — expect "No such file or directory"
      3. Run `git status --short` — expect renamed files showing as R (rename)
    Expected Result: 6 files in sifely/, 0 files in locks/, git tracks as renames
    Evidence: .sisyphus/evidence/task-1-directory-rename.txt
  ```

  **Commit**: YES
  - Message: `refactor(worker-tools): rename locks/ to sifely/`
  - Files: `src/worker-tools/sifely/*`

- [x] 2. Create shared `sifely/lib/api.ts`

  **What to do**:
  - Create `src/worker-tools/sifely/lib/api.ts`
  - Extract from `sifely-client.ts` into this shared module:
    - All TypeScript interfaces: `SifelyLoginResponse`, `SifelyListResponse<T>`, `SifelyPasscodeRaw`, `SifelyAccessRecordRaw`, `SifelyLock`, `SifelyLockListResponse`, `SifelyCreatePasscodeResponse`, `SifelyMutationResponse`, `LockPasscode`, `AccessRecord`
    - `login()` function — Sifely auth with HTTP 200 error-body checking
    - `withRetry<T>()` function — exponential backoff (5 attempts, 2s base, retries 5xx only)
    - `resolveConfig()` function — reads `SIFELY_USERNAME`, `SIFELY_PASSWORD`, `SIFELY_CLIENT_ID`, `SIFELY_BASE_URL` from env, validates presence, returns `{ baseUrl, clientId, username, password }`
    - `assertListSuccess<T>()` helper — checks the "code presence = error" pattern for list endpoints
    - `assertMutationSuccess()` helper — checks errcode/code pattern for mutation endpoints
  - All functions and interfaces must be `export`ed
  - The `login()` function MUST include the comments documenting Sifely API quirks (HTTP 200 on auth failure, Bearer prefix requirement)
  - The `withRetry()` function MUST build params inside the retry lambda (fresh `date` on every attempt) — document this requirement in a code comment

  **Must NOT do**:
  - Do not add business logic (passcode naming, code generation, property lookup)
  - Do not create a barrel `lib/index.ts`
  - Do not import from any other worker-tool directory

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Requires understanding of Sifely API quirks documented in `sifely-client.ts` and the consolidated guide

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T3, T4)
  - **Blocks**: T5, T6, T7, T8, T9, T10, T11
  - **Blocked By**: T1

  **References**:
  **Pattern References**:
  - `src/worker-tools/sifely/sifely-client.ts:155-190` — `login()` function to extract
  - `src/worker-tools/sifely/sifely-client.ts:313-330` — `withRetry()` function to extract
  - `src/worker-tools/sifely/sifely-client.ts:19-106` — all interfaces to extract
  - `src/worker-tools/sifely/sifely-client.ts:332-378` — `createPasscode()` showing the "params inside retry lambda" pattern that `withRetry` must support

  **External References**:
  - `docs/guides/2026-05-13-2157-sifely-lock-management-guide.md` — API rules, known bugs, quirks

  **Acceptance Criteria**:
  - [ ] File exists at `src/worker-tools/sifely/lib/api.ts`
  - [ ] All 10 interfaces exported
  - [ ] `login()`, `withRetry()`, `resolveConfig()`, `assertListSuccess()`, `assertMutationSuccess()` all exported
  - [ ] `pnpm lint src/worker-tools/sifely/lib/api.ts` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: lib/api.ts compiles and exports correctly
    Tool: Bash
    Steps:
      1. Run `pnpm exec tsc --noEmit src/worker-tools/sifely/lib/api.ts` — expect clean compile
      2. Run a Node one-liner to verify exports: `node -e "import('./src/worker-tools/sifely/lib/api.ts').catch(e => console.log('Expected — tsx needed'))"` — just verify no syntax errors
      3. Grep for `export function login` in the file — must exist
      4. Grep for `export async function withRetry` in the file — must exist
      5. Grep for `export function resolveConfig` in the file — must exist
    Expected Result: File compiles, all expected exports present
    Evidence: .sisyphus/evidence/task-2-lib-api-exports.txt

  Scenario: resolveConfig validates required env vars
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/lib/api.ts` (if it has a self-test) or write a quick inline test: `node --loader tsx -e "import { resolveConfig } from './src/worker-tools/sifely/lib/api.ts'; try { resolveConfig(); } catch(e) { console.log('PASS: ' + e.message); }"`
      2. Expect error message mentioning missing SIFELY_USERNAME
    Expected Result: Missing env vars produce clear error messages
    Evidence: .sisyphus/evidence/task-2-lib-api-env-validation.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 3. Move Hostfully tools to `hostfully/` directory

  **What to do**:
  - `git mv src/worker-tools/sifely/hostfully-door-code.ts src/worker-tools/hostfully/get-door-code.ts`
  - `git mv src/worker-tools/sifely/update-door-code.ts src/worker-tools/hostfully/update-door-code.ts`
  - Verify both files work at their new locations (`--help` exits 0)
  - These tools have NO imports from sibling files — they're fully self-contained, so the move is safe

  **Must NOT do**:
  - Do not change the code inside these files (they're already correct)
  - Do not update Dockerfile or seed.ts yet — that's Wave 5

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T4)
  - **Blocks**: T12
  - **Blocked By**: T1

  **References**:
  - `src/worker-tools/sifely/hostfully-door-code.ts` — 105 lines, reads Hostfully door_code custom data
  - `src/worker-tools/sifely/update-door-code.ts` — 161 lines, updates Hostfully door_code custom data
  - `src/worker-tools/hostfully/` — existing Hostfully tools directory (7 files already there)

  **Acceptance Criteria**:
  - [ ] `src/worker-tools/hostfully/get-door-code.ts` exists
  - [ ] `src/worker-tools/hostfully/update-door-code.ts` exists
  - [ ] Neither file exists in `src/worker-tools/sifely/`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Moved Hostfully tools respond to --help
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/hostfully/get-door-code.ts --help` — expect exit 0, usage text
      2. Run `tsx src/worker-tools/hostfully/update-door-code.ts --help` — expect exit 0, usage text
      3. Run `ls src/worker-tools/sifely/hostfully-door-code.ts 2>&1` — expect "No such file"
      4. Run `ls src/worker-tools/sifely/update-door-code.ts 2>&1` — expect "No such file"
    Expected Result: Both tools work at new location, old files removed
    Evidence: .sisyphus/evidence/task-3-hostfully-move.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 4. Clean up `generate-code.ts` — merge duplicate functions

  **What to do**:
  - In `src/worker-tools/sifely/generate-code.ts`, make `generateMemorableCode()` call `generateMemorableCodeWithMeta()` and return only `.code`
  - This eliminates the duplicated loop logic between the two functions (~20 lines)
  - The `main()` CLI function already calls `generateMemorableCodeWithMeta()` — no CLI change needed
  - **CRITICAL**: The JSON output format (`{"code":"1221","pattern":"mirror","length":4,"description":"..."}`) must NOT change — `rotate-property-code.ts` parses this

  **Must NOT do**:
  - Do not change the CLI interface or output format
  - Do not change the code generation algorithm
  - Do not add new features

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T3)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:
  - `src/worker-tools/sifely/generate-code.ts:198-221` — `generateMemorableCode()` with duplicated loop
  - `src/worker-tools/sifely/generate-code.ts:231-258` — `generateMemorableCodeWithMeta()` — the one to keep as primary
  - `src/worker-tools/sifely/rotate-property-code.ts:250-251` — parses `generate-code.ts` stdout as `{ code: string }`

  **Acceptance Criteria**:
  - [ ] `generateMemorableCode()` implementation is now a one-liner calling `generateMemorableCodeWithMeta().code`
  - [ ] `tsx src/worker-tools/sifely/generate-code.ts` produces valid JSON with `code`, `pattern`, `length`, `description` fields
  - [ ] `pnpm test -- --run tests/worker-tools/generate-code.test.ts` passes (if test exists at old path, may need path adjustment in T13)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: generate-code output unchanged
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/generate-code.ts` 5 times
      2. Pipe each output through `node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(typeof d.code, typeof d.pattern, typeof d.length, typeof d.description)"`
      3. Expect "string string number string" every time
    Expected Result: JSON output shape preserved across multiple runs
    Evidence: .sisyphus/evidence/task-4-generate-code-output.txt
  ```

  **Commit**: NO (groups with Wave 2)

- [x] 5. Create `list-locks.ts` — standalone tool

  **What to do**:
  - Create `src/worker-tools/sifely/list-locks.ts`
  - Import `login`, `resolveConfig`, `withRetry`, `SifelyLock`, `SifelyLockListResponse` from `./lib/api.ts`
  - Implement: `parseArgs` (--help only, no required args), env validation via `resolveConfig()`, login, fetch `/v3/lock/list` with pagination (pageSize=1000), write JSON array to stdout
  - Follow shell tool checklist pattern exactly
  - **Output contract**: Must produce identical JSON to `sifely-client.ts --action list-locks` — an array of `SifelyLock` objects

  **Must NOT do**:
  - Do not add filtering or formatting options — keep it identical to the old behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T6-T11)
  - **Blocks**: T12
  - **Blocked By**: T2

  **References**:
  - `src/worker-tools/sifely/sifely-client.ts:281-311` — `listLocks()` function to port
  - `src/worker-tools/sifely/sifely-client.ts:580-582` — CLI dispatch for list-locks action
  - `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — shell tool checklist pattern
  - `src/worker-tools/sifely/lib/api.ts` — shared imports (created in T2)

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/sifely/list-locks.ts --help` exits 0 with usage text
  - [ ] Running without `SIFELY_USERNAME` prints error to stderr, exits 1

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: list-locks --help works
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-locks.ts --help`
      2. Expect exit code 0
      3. Expect stdout contains "list-locks" and "SIFELY_USERNAME"
    Expected Result: Help text printed, clean exit
    Evidence: .sisyphus/evidence/task-5-list-locks-help.txt

  Scenario: list-locks fails cleanly without credentials
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-locks.ts` without SIFELY_USERNAME set
      2. Expect exit code 1
      3. Expect stderr contains "SIFELY_USERNAME"
    Expected Result: Clear error message about missing env var
    Evidence: .sisyphus/evidence/task-5-list-locks-no-creds.txt
  ```

  **Commit**: NO (groups with Wave 3+4)

- [x] 6. Create `list-passcodes.ts` — standalone tool

  **What to do**:
  - Create `src/worker-tools/sifely/list-passcodes.ts`
  - Import from `./lib/api.ts`: `login`, `resolveConfig`, `withRetry`, `LockPasscode`, `SifelyListResponse`, `SifelyPasscodeRaw`, `assertListSuccess`
  - Implement: `parseArgs` (--lock-id required, --help), env validation, login, fetch `/v3/lock/listKeyboardPwd` with pagination (pageSize=100), map to `LockPasscode[]`, write JSON array to stdout
  - **Output contract**: Must produce identical JSON to `sifely-client.ts --action list-passcodes --lock-id <id>`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T5, T7-T11)
  - **Blocks**: T12
  - **Blocked By**: T2

  **References**:
  - `src/worker-tools/sifely/sifely-client.ts:192-232` — `listPasscodes()` function to port
  - `src/worker-tools/sifely/sifely-client.ts:557-559` — CLI dispatch for list-passcodes

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/sifely/list-passcodes.ts --help` exits 0
  - [ ] Running without `--lock-id` prints error to stderr, exits 1

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: list-passcodes validates --lock-id
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-passcodes.ts` (no args)
      2. Expect exit code 1, stderr contains "--lock-id"
      3. Run `tsx src/worker-tools/sifely/list-passcodes.ts --help`
      4. Expect exit code 0
    Expected Result: Required arg validation works, help works
    Evidence: .sisyphus/evidence/task-6-list-passcodes-validation.txt
  ```

  **Commit**: NO (groups with Wave 3+4)

- [x] 7. Create `list-access-records.ts` — standalone tool

  **What to do**:
  - Create `src/worker-tools/sifely/list-access-records.ts`
  - Import from `./lib/api.ts`
  - Implement: `parseArgs` (--lock-id, --start-date, --end-date required, --help), env validation, login, fetch `/v3/lockRecord/list`, map to `AccessRecord[]`, write JSON array to stdout
  - **Output contract**: Must produce identical JSON to `sifely-client.ts --action list-access-records`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T5, T6, T8-T11)
  - **Blocks**: T12
  - **Blocked By**: T2

  **References**:
  - `src/worker-tools/sifely/sifely-client.ts:234-279` — `listAccessRecords()` function to port
  - `src/worker-tools/sifely/sifely-client.ts:560-579` — CLI dispatch

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/sifely/list-access-records.ts --help` exits 0
  - [ ] Running without --lock-id, --start-date, --end-date prints error, exits 1

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: list-access-records validates required args
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-access-records.ts` (no args) — expect exit 1
      2. Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 123` (missing dates) — expect exit 1
      3. Run `tsx src/worker-tools/sifely/list-access-records.ts --help` — expect exit 0
    Expected Result: All 3 required args validated, help works
    Evidence: .sisyphus/evidence/task-7-list-access-records-validation.txt
  ```

  **Commit**: NO (groups with Wave 3+4)

- [x] 8. Create `create-passcode.ts` — standalone tool (PERMANENT ONLY)

  **What to do**:
  - Create `src/worker-tools/sifely/create-passcode.ts`
  - Import from `./lib/api.ts`
  - Implement: `parseArgs` (--lock-id, --name, --code required, --help), env validation, login
  - **CRITICAL — Permanent only**: Always use `keyboardPwdType=2`, `startDate=Date.now()`, `endDate=0`, `addType=1`. No `--type` flag. No `--start-date`/`--end-date` for timed codes.
  - **Dedup check**: Before creating, call `listPasscodes` and check if a passcode with the same `--name` already exists. If so, output `{ "keyboardPwdId": <id>, "existed": true }` and exit 0 (same behavior as old sifely-client.ts)
  - **Post-create verification (NEW)**: After creating, call `listPasscodes` again and find the newly created passcode. Verify `keyboardPwdType === 2`. If not, write a WARNING to stderr: `"WARNING: Created passcode has keyboardPwdType=${type}, expected 2 (permanent). The Sifely API may have changed behavior."`
  - The `createPasscode` API call must be wrapped in `withRetry` with params built INSIDE the lambda (fresh `date` on every attempt)
  - **Output contract**: Must produce `{ "keyboardPwdId": <number> }` on success (same as old tool)

  **Must NOT do**:
  - No `--type` flag
  - No `--start-date` / `--end-date` flags for timed codes
  - Do not change the JSON output shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T5-T7, T9-T11)
  - **Blocks**: T12
  - **Blocked By**: T2

  **References**:
  - `src/worker-tools/sifely/sifely-client.ts:332-378` — `createPasscode()` function to port (params inside withRetry lambda)
  - `src/worker-tools/sifely/sifely-client.ts:583-626` — CLI dispatch with dedup check
  - `docs/guides/2026-05-13-2157-sifely-lock-management-guide.md:28-44` — endDate/type behavior table
  - `docs/guides/2026-05-13-2157-sifely-lock-management-guide.md:56-63` — API rules (addType=1, keyboardPwdType=2)

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/sifely/create-passcode.ts --help` exits 0
  - [ ] `--help` output does NOT mention `--type`, `timed`, or scheduling options
  - [ ] Grep the file for `keyboardPwdType` — only value should be `'2'`
  - [ ] Grep the file for `endDate` — only value used for create should be `0`
  - [ ] Running without --lock-id, --name, --code prints error, exits 1
  - [ ] `--code` validation: rejects non-numeric and <4 or >9 digit codes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: create-passcode rejects timed passcode flags
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/create-passcode.ts --help`
      2. Verify stdout does NOT contain "--type" or "timed"
      3. Grep file: `grep -c "timed" src/worker-tools/sifely/create-passcode.ts` — expect 0
    Expected Result: No timed passcode support exists in the tool
    Evidence: .sisyphus/evidence/task-8-create-passcode-no-timed.txt

  Scenario: create-passcode validates code format
    Tool: Bash
    Steps:
      1. Run `SIFELY_USERNAME=x SIFELY_PASSWORD=x tsx src/worker-tools/sifely/create-passcode.ts --lock-id 1 --name test --code abc` — expect exit 1
      2. Run `SIFELY_USERNAME=x SIFELY_PASSWORD=x tsx src/worker-tools/sifely/create-passcode.ts --lock-id 1 --name test --code 12` — expect exit 1 (too short)
    Expected Result: Non-numeric and wrong-length codes rejected
    Evidence: .sisyphus/evidence/task-8-create-passcode-validation.txt
  ```

  **Commit**: NO (groups with Wave 3+4)

- [x] 9. Create `update-passcode.ts` — standalone tool

  **What to do**:
  - Create `src/worker-tools/sifely/update-passcode.ts`
  - Import from `./lib/api.ts`
  - Implement: `parseArgs` (--lock-id, --passcode-id required; --name, --code, --start-date, --end-date optional; --help), env validation, login, POST `/v3/keyboardPwd/change` with `changeType=1`
  - **Output contract**: Must produce `{ "ok": true }` on success (same as old tool)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T5-T8, T10, T11)
  - **Blocks**: T12
  - **Blocked By**: T2

  **References**:
  - `src/worker-tools/sifely/sifely-client.ts:381-434` — `updatePasscode()` function to port
  - `src/worker-tools/sifely/sifely-client.ts:627-646` — CLI dispatch

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/sifely/update-passcode.ts --help` exits 0
  - [ ] Running without --lock-id or --passcode-id prints error, exits 1

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: update-passcode validates required args
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/update-passcode.ts` — expect exit 1, error mentions "--lock-id"
      2. Run `tsx src/worker-tools/sifely/update-passcode.ts --lock-id 123` — expect exit 1, error mentions "--passcode-id"
      3. Run `tsx src/worker-tools/sifely/update-passcode.ts --help` — expect exit 0
    Expected Result: Both required args validated independently
    Evidence: .sisyphus/evidence/task-9-update-passcode-validation.txt
  ```

  **Commit**: NO (groups with Wave 3+4)

- [x] 10. Create `delete-passcode.ts` — standalone tool

  **What to do**:
  - Create `src/worker-tools/sifely/delete-passcode.ts`
  - Import from `./lib/api.ts`
  - Implement: `parseArgs` (--lock-id, --passcode-id required, --help), env validation, login, POST `/v3/keyboardPwd/delete` with `deleteType=1`
  - **Output contract**: Must produce `{ "ok": true }` on success (same as old tool)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T5-T9, T11)
  - **Blocks**: T12
  - **Blocked By**: T2

  **References**:
  - `src/worker-tools/sifely/sifely-client.ts:436-472` — `deletePasscode()` function to port
  - `src/worker-tools/sifely/sifely-client.ts:647-654` — CLI dispatch

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/sifely/delete-passcode.ts --help` exits 0
  - [ ] Running without --lock-id or --passcode-id prints error, exits 1

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: delete-passcode validates required args
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/delete-passcode.ts` — expect exit 1
      2. Run `tsx src/worker-tools/sifely/delete-passcode.ts --help` — expect exit 0
    Expected Result: Required args validated, help works
    Evidence: .sisyphus/evidence/task-10-delete-passcode-validation.txt
  ```

  **Commit**: NO (groups with Wave 3+4)

- [x] 11. Rewrite `diagnose-access.ts` to import from `lib/api.ts`

  **What to do**:
  - Rewrite `src/worker-tools/sifely/diagnose-access.ts` to:
    - Import `login`, `resolveConfig`, `withRetry`, `LockPasscode`, `AccessRecord`, and all Sifely interfaces from `./lib/api.ts`
    - Remove the duplicated functions: `sifelyLogin()`, `sifelyListPasscodes()`, `sifelyListAccessRecords()`, and all duplicated Sifely interfaces (~250 lines eliminated)
    - Replace inline Sifely API calls with imported `login()` + direct fetch calls that use `withRetry` (the current code has NO retry — this fixes a convention violation)
    - Keep `fetchHostfullyDoorCode()`, `queryPropertyLocks()`, `deriveExpectedPasscodeName()`, `buildDiagnosisSummary()` functions — these are unique to diagnosis
    - Keep all the diagnosis-specific interfaces (`PropertyLock`, `LockDiagnosisResult`, `DiagnosisOutput`)
  - **Output contract**: Must produce identical JSON structure to current `diagnose-access.ts`
  - The `CustomDataField`/`CustomDataEntry` interfaces stay inline (they're also used by the Hostfully tools, but since those moved to `hostfully/`, there's no cross-directory sharing to worry about)

  **Must NOT do**:
  - Do not change the CLI interface (--property-id, --help)
  - Do not change the JSON output structure
  - Do not add new features

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T5-T10)
  - **Blocks**: T13
  - **Blocked By**: T2

  **References**:
  - `src/worker-tools/sifely/diagnose-access.ts:214-338` — duplicated Sifely functions to REMOVE
  - `src/worker-tools/sifely/diagnose-access.ts:76-110` — duplicated Sifely interfaces to REMOVE
  - `src/worker-tools/sifely/diagnose-access.ts:138-164` — `deriveExpectedPasscodeName()` to KEEP
  - `src/worker-tools/sifely/diagnose-access.ts:340-396` — `buildDiagnosisSummary()` to KEEP
  - `src/worker-tools/sifely/lib/api.ts` — shared imports (created in T2)

  **Acceptance Criteria**:
  - [ ] `diagnose-access.ts` imports from `./lib/api.ts`
  - [ ] No `sifelyLogin`, `sifelyListPasscodes`, or `sifelyListAccessRecords` functions exist in the file
  - [ ] `withRetry` is used for all Sifely API calls
  - [ ] File is under 350 lines (down from 602)
  - [ ] `tsx src/worker-tools/sifely/diagnose-access.ts --help` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: diagnose-access help still works
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/diagnose-access.ts --help`
      2. Expect exit 0, usage text mentions --property-id
    Expected Result: CLI interface unchanged
    Evidence: .sisyphus/evidence/task-11-diagnose-help.txt

  Scenario: No duplicated Sifely code remains
    Tool: Bash
    Steps:
      1. Grep: `grep -c "system/smart/login" src/worker-tools/sifely/diagnose-access.ts` — expect 0
      2. Grep: `grep -c "function sifelyLogin" src/worker-tools/sifely/diagnose-access.ts` — expect 0
      3. Grep: `grep -c "function sifelyListPasscodes" src/worker-tools/sifely/diagnose-access.ts` — expect 0
      4. Grep: `grep -c "withRetry" src/worker-tools/sifely/diagnose-access.ts` — expect >= 1
    Expected Result: All duplicated functions removed, withRetry is used
    Evidence: .sisyphus/evidence/task-11-diagnose-no-dupes.txt
  ```

  **Commit**: NO (groups with Wave 3+4)

- [x] 12. Rewrite `rotate-property-code.ts` + delete `sifely-client.ts`

  **What to do**:
  - Update `src/worker-tools/sifely/rotate-property-code.ts`:
    - Change all `toolPath('sifely-client.ts') --action list-passcodes` calls → `toolPath('list-passcodes.ts')`
    - Change `toolPath('sifely-client.ts') --action update-passcode` → `toolPath('update-passcode.ts')`
    - Change `toolPath('sifely-client.ts') --action create-passcode` → `toolPath('create-passcode.ts')`
    - Change `toolPath('update-door-code.ts')` → a new `hostfullyToolPath('update-door-code.ts')` function that resolves to `path.join(__dirname, '..', 'hostfully', name)` — this works both locally (`src/worker-tools/sifely/../hostfully/`) and in Docker (`/tools/sifely/../hostfully/`)
    - `toolPath('generate-code.ts')` stays the same (generate-code.ts is still in sifely/)
    - Add retry to `runTool()`: wrap the function with a retry mechanism for Sifely mutation calls (create/update passcode). When `exitCode !== 0` and the error contains a 5xx pattern, retry up to 3 times with 3s delay between attempts. Keep the current `runTool()` signature unchanged.
    - Update the existing type-2 filter on line 321 (`p.keyboardPwdType === 2`) to remain as-is — this is already correct
  - Delete `src/worker-tools/sifely/sifely-client.ts` — fully replaced by individual tools
  - Verify the tool path resolution works by running `--help`

  **Must NOT do**:
  - Do not change the JSON output format of `rotate-property-code.ts`
  - Do not change the `runTool()` function signature
  - Do not change the `toolPath()` function behavior for sifely tools

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: T13, T14, T15, T16, T17
  - **Blocked By**: T3, T5, T6, T7, T8, T9, T10

  **References**:
  - `src/worker-tools/sifely/rotate-property-code.ts:104-106` — `toolPath()` function
  - `src/worker-tools/sifely/rotate-property-code.ts:206` — calls `sifely-client.ts --action list-passcodes`
  - `src/worker-tools/sifely/rotate-property-code.ts:270` — calls `update-door-code.ts` (needs cross-directory path)
  - `src/worker-tools/sifely/rotate-property-code.ts:291` — calls `sifely-client.ts --action list-passcodes` (second time)
  - `src/worker-tools/sifely/rotate-property-code.ts:326` — calls `sifely-client.ts --action update-passcode`
  - `src/worker-tools/sifely/rotate-property-code.ts:347` — calls `sifely-client.ts --action create-passcode`
  - `src/worker-tools/sifely/rotate-property-code.ts:236` — calls `generate-code.ts`

  **Acceptance Criteria**:
  - [ ] `sifely-client.ts` does NOT exist in `src/worker-tools/sifely/`
  - [ ] `rotate-property-code.ts` references `list-passcodes.ts`, `update-passcode.ts`, `create-passcode.ts` (not `sifely-client.ts`)
  - [ ] `rotate-property-code.ts` uses `hostfullyToolPath()` for `update-door-code.ts`
  - [ ] `tsx src/worker-tools/sifely/rotate-property-code.ts --help` exits 0
  - [ ] Grep: `grep -c "sifely-client" src/worker-tools/sifely/rotate-property-code.ts` = 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: rotate-property-code --help still works
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/rotate-property-code.ts --help`
      2. Expect exit 0, usage text printed
    Expected Result: CLI interface unchanged
    Evidence: .sisyphus/evidence/task-12-rotate-help.txt

  Scenario: sifely-client.ts is fully deleted
    Tool: Bash
    Steps:
      1. Run `ls src/worker-tools/sifely/sifely-client.ts 2>&1` — expect "No such file"
      2. Run `grep -r "sifely-client" src/worker-tools/sifely/` — expect only comment references (if any), no import/require
    Expected Result: Monolith fully removed, no references remain
    Evidence: .sisyphus/evidence/task-12-sifely-client-deleted.txt
  ```

  **Commit**: YES
  - Message: `refactor(worker-tools): split sifely-client into individual tools`
  - Files: 6 new tools, diagnose-access.ts, rotate-property-code.ts, deleted sifely-client.ts

- [ ] 13. Update + move test files

  **What to do**:
  - Move test directory: `git mv tests/worker-tools/locks/ tests/worker-tools/sifely/`
  - Move stray test files:
    - `git mv tests/worker-tools/generate-code.test.ts tests/worker-tools/sifely/generate-code.test.ts`
    - `git mv tests/worker-tools/update-door-code.test.ts tests/worker-tools/hostfully/update-door-code.test.ts` (create `tests/worker-tools/hostfully/` if needed)
  - Update source path references in all moved test files:
    - `tests/worker-tools/sifely/sifely-client.test.ts` — This test tested the monolith. Either delete it (the monolith is gone) or refactor it into individual tool tests. **Decision: delete it** — the new tools get their QA scenarios, and output contract tests can be added later.
    - `tests/worker-tools/sifely/diagnose-access.test.ts` — Update import path from `../../../src/worker-tools/locks/` → `../../../src/worker-tools/sifely/`
    - `tests/worker-tools/sifely/diagnose-access-integration.test.ts` — Same path update
    - `tests/worker-tools/sifely/generate-code.test.ts` — Update import from `../../src/worker-tools/locks/generate-code.js` → `../../src/worker-tools/sifely/generate-code.js`
    - `tests/worker-tools/hostfully/update-door-code.test.ts` — Update TOOL_PATH from `../../src/worker-tools/locks/update-door-code.ts` → `../../src/worker-tools/hostfully/update-door-code.ts`
  - Run `pnpm test -- --run` to verify all tests pass

  **Must NOT do**:
  - Do not write new tests for the individual tools — that's a separate concern
  - Do not change test logic, only file paths

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T14-T17)
  - **Blocks**: T18
  - **Blocked By**: T4, T11, T12

  **References**:
  - `tests/worker-tools/locks/sifely-client.test.ts:6` — `path.resolve(__dirname, '../../../src/worker-tools/locks/sifely-client.ts')`
  - `tests/worker-tools/locks/diagnose-access.test.ts:6` — same pattern
  - `tests/worker-tools/locks/diagnose-access-integration.test.ts:7` — same pattern
  - `tests/worker-tools/generate-code.test.ts:9` — `from '../../src/worker-tools/locks/generate-code.js'`
  - `tests/worker-tools/update-door-code.test.ts:3` — `const TOOL_PATH = '../../src/worker-tools/locks/update-door-code.ts'`

  **Acceptance Criteria**:
  - [ ] `tests/worker-tools/sifely/` directory exists with test files
  - [ ] `tests/worker-tools/locks/` directory does NOT exist
  - [ ] `tests/worker-tools/sifely/sifely-client.test.ts` does NOT exist (deleted with monolith)
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass after move
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run 2>&1 | tail -20`
      2. Expect "Tests passed" or equivalent vitest success message
      3. Run `ls tests/worker-tools/locks/ 2>&1` — expect "No such file or directory"
    Expected Result: Tests pass, old directory gone
    Evidence: .sisyphus/evidence/task-13-tests-pass.txt
  ```

  **Commit**: NO (groups with Wave 5)

- [ ] 14. Update Dockerfile

  **What to do**:
  - Replace lines 106-112 in `Dockerfile`:
    - Change `mkdir -p /tools/locks` → `mkdir -p /tools/sifely /tools/sifely/lib`
    - Remove all 6 old COPY lines for `/tools/locks/`
    - Add COPY lines for new structure:
      - `COPY --from=builder /build/src/worker-tools/sifely/lib/api.ts /tools/sifely/lib/api.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/list-locks.ts /tools/sifely/list-locks.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/list-passcodes.ts /tools/sifely/list-passcodes.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/list-access-records.ts /tools/sifely/list-access-records.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/create-passcode.ts /tools/sifely/create-passcode.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/update-passcode.ts /tools/sifely/update-passcode.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/delete-passcode.ts /tools/sifely/delete-passcode.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/diagnose-access.ts /tools/sifely/diagnose-access.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/rotate-property-code.ts /tools/sifely/rotate-property-code.ts`
      - `COPY --from=builder /build/src/worker-tools/sifely/generate-code.ts /tools/sifely/generate-code.ts`
    - Add COPY lines for the moved Hostfully tools (if not already in Dockerfile):
      - `COPY --from=builder /build/src/worker-tools/hostfully/get-door-code.ts /tools/hostfully/get-door-code.ts`
      - `COPY --from=builder /build/src/worker-tools/hostfully/update-door-code.ts /tools/hostfully/update-door-code.ts`
    - Remove old COPY for `update-door-code.ts` and `hostfully-door-code.ts` from the old locks section

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T13, T15-T17)
  - **Blocks**: T18
  - **Blocked By**: T12

  **References**:
  - `Dockerfile:106-112` — current locks COPY lines to replace

  **Acceptance Criteria**:
  - [ ] No references to `/tools/locks/` in Dockerfile
  - [ ] All 10 sifely tools + lib/api.ts have COPY lines
  - [ ] Both new hostfully tools have COPY lines
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dockerfile has no locks references
    Tool: Bash
    Steps:
      1. Grep: `grep -c "/tools/locks" Dockerfile` — expect 0
      2. Grep: `grep -c "/tools/sifely" Dockerfile` — expect >= 10
      3. Grep: `grep -c "get-door-code" Dockerfile` — expect 1
    Expected Result: All paths updated to sifely/, hostfully tools included
    Evidence: .sisyphus/evidence/task-14-dockerfile.txt
  ```

  **Commit**: NO (groups with Wave 5)

- [ ] 15. Update `prisma/seed.ts` — archetype instructions + tools arrays

  **What to do**:
  - Find-and-replace all `/tools/locks/` → `/tools/sifely/` in archetype `instructions` strings and `tools[]` arrays
  - Update tool names where the monolith was referenced:
    - `tsx /tools/locks/sifely-client.ts --action list-passcodes` → `tsx /tools/sifely/list-passcodes.ts`
    - `tsx /tools/locks/sifely-client.ts --action create-passcode` → `tsx /tools/sifely/create-passcode.ts`
    - etc. for all actions referenced in instructions
    - `tsx /tools/locks/diagnose-access.ts` → `tsx /tools/sifely/diagnose-access.ts`
    - `tsx /tools/locks/rotate-property-code.ts` → `tsx /tools/sifely/rotate-property-code.ts`
  - In `tools[]` arrays:
    - `/tools/locks/diagnose-access.ts` → `/tools/sifely/diagnose-access.ts`
    - `/tools/locks/rotate-property-code.ts` → `/tools/sifely/rotate-property-code.ts`
  - If any archetype instructions reference `update-door-code.ts` at `/tools/locks/`, update to `/tools/hostfully/update-door-code.ts`
  - **IMPORTANT**: After changing seed.ts, the DB must be re-seeded (handled in T18)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T13, T14, T16, T17)
  - **Blocks**: T18
  - **Blocked By**: T12

  **References**:
  - `prisma/seed.ts:304` — `tsx /tools/locks/diagnose-access.ts`
  - `prisma/seed.ts:360,362` — tool reference + CLI usage in instructions
  - `prisma/seed.ts:3305,3337` — `/tools/locks/diagnose-access.ts` in tools[] arrays
  - `prisma/seed.ts:3397,3498` — `tsx /tools/locks/rotate-property-code.ts` in instructions
  - `prisma/seed.ts:3450,3551` — `/tools/locks/rotate-property-code.ts` in tools[] arrays

  **Acceptance Criteria**:
  - [ ] `grep -c "/tools/locks/" prisma/seed.ts` = 0
  - [ ] `grep -c "/tools/sifely/" prisma/seed.ts` >= 9

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No locks references remain in seed.ts
    Tool: Bash
    Steps:
      1. Grep: `grep -c "/tools/locks/" prisma/seed.ts` — expect 0
      2. Grep: `grep "/tools/sifely/" prisma/seed.ts | wc -l` — expect >= 9
      3. Grep: `grep "sifely-client" prisma/seed.ts | wc -l` — expect 0 (monolith references removed)
    Expected Result: All paths updated, no orphan references
    Evidence: .sisyphus/evidence/task-15-seed-paths.txt
  ```

  **Commit**: NO (groups with Wave 5)

- [ ] 16. Update AGENTS.md

  **What to do**:
  - Replace the "Lock tools" section (lines 67-76) with a "Sifely tools" section
  - Update directory description: `src/worker-tools/sifely/` — pre-installed at `/tools/sifely/`
  - List each new individual tool with usage example:
    - `tsx /tools/sifely/list-locks.ts` — list all locks
    - `tsx /tools/sifely/list-passcodes.ts --lock-id <id>` — list passcodes
    - `tsx /tools/sifely/list-access-records.ts --lock-id <id> --start-date <ms> --end-date <ms>` — list access records
    - `tsx /tools/sifely/create-passcode.ts --lock-id <id> --name "Name" --code "1234"` — create permanent passcode
    - `tsx /tools/sifely/update-passcode.ts --lock-id <id> --passcode-id <id> [--code "digits"] [--name "Name"]` — update passcode
    - `tsx /tools/sifely/delete-passcode.ts --lock-id <id> --passcode-id <id>` — delete passcode
    - `tsx /tools/sifely/generate-code.ts [--length 4|5|6] [--exclude-codes "1221,2332"]` — generate memorable code
    - `tsx /tools/sifely/rotate-property-code.ts --property-id <uid>` — rotate all lock codes for a property
    - `tsx /tools/sifely/diagnose-access.ts --property-id <uid>` — diagnose lock access issues
  - Add the moved Hostfully tools to the Hostfully tools section:
    - `tsx /tools/hostfully/get-door-code.ts --property-id <uid>` — read door code from Hostfully
    - `tsx /tools/hostfully/update-door-code.ts --property-id <uid> --code <digits>` — update door code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T13-T15, T17)
  - **Blocks**: T18
  - **Blocked By**: T12

  **References**:
  - `AGENTS.md:67-76` — current "Lock tools" section to replace

  **Acceptance Criteria**:
  - [ ] `grep -c "/tools/locks/" AGENTS.md` = 0
  - [ ] `grep -c "sifely-client" AGENTS.md` = 0
  - [ ] AGENTS.md mentions all 9 sifely tools + 2 new hostfully tools

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md has no locks references
    Tool: Bash
    Steps:
      1. Grep: `grep -c "/tools/locks/" AGENTS.md` — expect 0
      2. Grep: `grep -c "sifely-client" AGENTS.md` — expect 0
      3. Grep: `grep -c "/tools/sifely/" AGENTS.md` — expect >= 9
    Expected Result: All references updated
    Evidence: .sisyphus/evidence/task-16-agents-md.txt
  ```

  **Commit**: NO (groups with Wave 5)

- [ ] 17. Update documentation files

  **What to do**:
  - Update these 4 docs (none are snapshots — all editable):
    - `docs/guides/2026-05-13-2157-sifely-lock-management-guide.md` — update all `src/worker-tools/locks/` → `src/worker-tools/sifely/`, update tool command examples from `sifely-client.ts --action X` to individual tools, update "Related Files" table
    - `docs/guides/2026-05-08-1204-guest-messaging-employee-guide.md` — update `/tools/locks/diagnose-access.ts` → `/tools/sifely/diagnose-access.ts`
    - `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — update the reference to `sifely-client.ts` in the Reference Implementations table
    - `docs/planning/2026-04-21-2202-phase1-story-map.md` — update tool path references
  - **Do NOT edit** any files in `docs/snapshots/` — immutable by convention

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with T13-T16)
  - **Blocks**: T18
  - **Blocked By**: T12

  **Acceptance Criteria**:
  - [ ] `grep -rn "/tools/locks/" docs/guides/ docs/planning/` returns 0 matches
  - [ ] `grep -rn "sifely-client" docs/guides/ docs/planning/` returns 0 matches (or only historical context)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docs have no stale locks references
    Tool: Bash
    Steps:
      1. Grep: `grep -rn "worker-tools/locks/" docs/` — expect 0 matches outside snapshots
      2. Grep: `grep -rn "/tools/locks/" docs/guides/ docs/planning/` — expect 0
    Expected Result: All non-snapshot docs updated
    Evidence: .sisyphus/evidence/task-17-docs-updated.txt
  ```

  **Commit**: YES (groups all Wave 5)
  - Message: `refactor: update all references for sifely tool restructure`
  - Files: Dockerfile, seed.ts, AGENTS.md, test files, doc files
  - Pre-commit: `pnpm lint`

- [ ] 18. Re-seed DB + Docker rebuild + full test suite

  **What to do**:
  - Run `pnpm prisma db seed` to update archetype instructions in the dev database
  - Run `pnpm prisma db seed` a SECOND time to verify idempotency (second run must exit 0 with no errors)
  - Run `pnpm test:db:setup` to update the test database
  - Run `docker build -t ai-employee-worker:latest .` to rebuild the Docker image
  - Run `pnpm test -- --run` to verify all tests pass
  - Run `pnpm lint` to verify no lint errors
  - Run `pnpm build` to verify TypeScript compilation
  - Smoke-test: Run each new tool with `--help` inside the Docker container:
    ```
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/list-locks.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/list-passcodes.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/create-passcode.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/update-passcode.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/delete-passcode.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/list-access-records.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/diagnose-access.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/rotate-property-code.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/sifely/generate-code.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/hostfully/get-door-code.ts --help
    docker run --rm ai-employee-worker:latest tsx /tools/hostfully/update-door-code.ts --help
    ```
  - Verify no files remain at old paths:
    ```
    docker run --rm ai-employee-worker:latest ls /tools/locks/ 2>&1  # expect error
    docker run --rm ai-employee-worker:latest ls /tools/sifely/sifely-client.ts 2>&1  # expect error
    ```

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 6 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: T13, T14, T15, T16, T17

  **References**:
  - `prisma/seed.ts` — updated in T15
  - `Dockerfile` — updated in T14

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` exits 0 (twice — idempotent)
  - [ ] `pnpm test:db:setup` exits 0
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds
  - [ ] `pnpm test -- --run` — all tests pass
  - [ ] `pnpm lint` — 0 errors
  - [ ] `pnpm build` — clean compile
  - [ ] All 11 tools respond to `--help` inside Docker container (exit 0)
  - [ ] `/tools/locks/` does not exist in Docker container
  - [ ] `/tools/sifely/sifely-client.ts` does not exist in Docker container

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full integration smoke test
    Tool: Bash (tmux for Docker build)
    Steps:
      1. Run `pnpm prisma db seed` — expect exit 0
      2. Run `pnpm prisma db seed` again — expect exit 0 (idempotency)
      3. Run `pnpm test:db:setup` — expect exit 0
      4. Run `docker build -t ai-employee-worker:latest .` — expect success
      5. Run all 11 `docker run --rm ... --help` commands — expect all exit 0
      6. Run `docker run --rm ai-employee-worker:latest ls /tools/locks/ 2>&1` — expect error
      7. Run `pnpm test -- --run` — expect all tests pass
      8. Run `pnpm lint` — expect 0 errors
    Expected Result: Full stack works end-to-end
    Evidence: .sisyphus/evidence/task-18-integration-smoke.txt

  Scenario: Seed idempotency
    Tool: Bash
    Steps:
      1. Run `pnpm prisma db seed` twice in succession
      2. Both runs must exit 0 with no "duplicate key" or constraint errors
    Expected Result: Seed is safe to run multiple times
    Evidence: .sisyphus/evidence/task-18-seed-idempotency.txt
  ```

  **Commit**: NO (verification only — no new code)

- [ ] 19. Live test `list-locks.ts` against Sifely API

  **What to do**:
  - **SAFETY**: Use ONLY the designated test lock (`24572672`) for verification. Do NOT modify any lock.
  - Set `SIFELY_USERNAME=admin@vlrealestate.co` and `SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58`
  - Run `tsx src/worker-tools/sifely/list-locks.ts`
  - Verify:
    1. Exit code is 0
    2. Output is valid JSON — parse with `node -e` or `jq`
    3. Output is an array with at least 1 entry
    4. The test lock `24572672` appears in the array (search by `lockId` field)
    5. Each lock object has expected fields: `lockId`, `lockName`, `lockMac`, `electricQuantity`
  - Save the full JSON output (or first 100 lines) as evidence

  **Must NOT do**:
  - Do not modify any locks
  - Do not call any other Sifely endpoint

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T20-T23)
  - **Blocks**: T24
  - **Blocked By**: T18

  **References**:
  - `AGENTS.md` — "Code-Rotation Testing" section: test lock ID `24572672`
  - `src/worker-tools/sifely/list-locks.ts` — the tool being tested

  **Acceptance Criteria**:
  - [ ] Exit code 0
  - [ ] Output parses as valid JSON array
  - [ ] Array contains a lock with `lockId === 24572672`
  - [ ] Lock objects have `lockId`, `lockName`, `lockMac` fields

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: list-locks returns test lock
    Tool: Bash
    Preconditions: SIFELY_USERNAME and SIFELY_PASSWORD set
    Steps:
      1. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/list-locks.ts > /tmp/list-locks-output.json`
      2. Assert exit code 0
      3. Run `node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/list-locks-output.json','utf8')); console.log('is_array:', Array.isArray(d)); console.log('count:', d.length); const test = d.find(l => l.lockId === 24572672); console.log('test_lock_found:', !!test); if(test) console.log('fields:', Object.keys(test).join(','))"`
      4. Assert: is_array=true, count >= 1, test_lock_found=true, fields include lockId,lockName,lockMac
    Expected Result: JSON array containing test lock 24572672 with all expected fields
    Failure Indicators: Exit code non-0, JSON parse error, test lock missing, missing fields
    Evidence: .sisyphus/evidence/task-19-list-locks.txt
  ```

  **Commit**: NO (verification only)

- [ ] 20. Live test `list-passcodes.ts` against Sifely API

  **What to do**:
  - Set Sifely credentials as env vars
  - Run `tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672`
  - Verify:
    1. Exit code is 0
    2. Output is valid JSON array
    3. Each passcode object has expected fields: `keyboardPwdId`, `keyboardPwdName`, `keyboardPwdType`, `keyboardPwd`
    4. At least one passcode exists (the test lock has active passcodes from prior work)
    5. All passcodes show `keyboardPwdType === 2` (permanent — per our earlier fix)

  **Must NOT do**:
  - Do not modify any passcodes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T19, T21-T23)
  - **Blocks**: T24
  - **Blocked By**: T18

  **References**:
  - `src/worker-tools/sifely/list-passcodes.ts` — the tool being tested

  **Acceptance Criteria**:
  - [ ] Exit code 0
  - [ ] Output parses as valid JSON array
  - [ ] Each entry has `keyboardPwdId`, `keyboardPwdName`, `keyboardPwdType`
  - [ ] All entries show `keyboardPwdType === 2`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: list-passcodes returns passcodes for test lock
    Tool: Bash
    Preconditions: SIFELY_USERNAME and SIFELY_PASSWORD set
    Steps:
      1. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672 > /tmp/list-passcodes-output.json`
      2. Assert exit code 0
      3. Run `node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/list-passcodes-output.json','utf8')); console.log('is_array:', Array.isArray(d)); console.log('count:', d.length); const allType2 = d.every(p => p.keyboardPwdType === 2); console.log('all_type_2:', allType2); const fields = d.length > 0 ? Object.keys(d[0]).join(',') : 'empty'; console.log('fields:', fields)"`
      4. Assert: is_array=true, count >= 1, all_type_2=true, fields include keyboardPwdId,keyboardPwdName,keyboardPwdType
    Expected Result: JSON array of type-2 permanent passcodes with correct fields
    Failure Indicators: Exit code non-0, JSON parse error, type !== 2, missing fields
    Evidence: .sisyphus/evidence/task-20-list-passcodes.txt
  ```

  **Commit**: NO (verification only)

- [ ] 21. Live test `list-access-records.ts` against Sifely API

  **What to do**:
  - Set Sifely credentials as env vars
  - Compute time range: `start_date` = 7 days ago (epoch ms), `end_date` = now (epoch ms)
  - Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 --start-date $start_date --end-date $end_date`
  - Verify:
    1. Exit code is 0
    2. Output is valid JSON array (may be empty — that's acceptable)
    3. If non-empty, each record has expected fields: `recordType`, `lockId`, `username`, `serverDate`

  **Must NOT do**:
  - Do not modify any data

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T19-T20, T22-T23)
  - **Blocks**: T24
  - **Blocked By**: T18

  **References**:
  - `src/worker-tools/sifely/list-access-records.ts` — the tool being tested

  **Acceptance Criteria**:
  - [ ] Exit code 0
  - [ ] Output parses as valid JSON array
  - [ ] If non-empty, records have `recordType`, `lockId` fields

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: list-access-records returns valid JSON for test lock
    Tool: Bash
    Preconditions: SIFELY_USERNAME and SIFELY_PASSWORD set
    Steps:
      1. Compute dates: `START=$(node -e "console.log(Date.now() - 7*24*60*60*1000)")` and `END=$(node -e "console.log(Date.now())")`
      2. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 --start-date $START --end-date $END > /tmp/list-access-records-output.json`
      3. Assert exit code 0
      4. Run `node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/list-access-records-output.json','utf8')); console.log('is_array:', Array.isArray(d)); console.log('count:', d.length); if(d.length > 0) console.log('sample_fields:', Object.keys(d[0]).join(','))"`
      5. Assert: is_array=true (count may be 0)
    Expected Result: Valid JSON array returned (empty is acceptable — the test lock may have no recent access)
    Failure Indicators: Exit code non-0, JSON parse error
    Evidence: .sisyphus/evidence/task-21-list-access-records.txt
  ```

  **Commit**: NO (verification only)

- [ ] 22. Live test `generate-code.ts` (no API — local generation)

  **What to do**:
  - No Sifely credentials needed — this tool generates codes locally
  - Run 5 times with different parameters and verify:
    1. Default: `tsx src/worker-tools/sifely/generate-code.ts` — produces JSON with `code`, `pattern`, `length`, `description`
    2. Length 5: `tsx src/worker-tools/sifely/generate-code.ts --length 5` — `length` field equals 5, code is 5 digits
    3. Length 6: `tsx src/worker-tools/sifely/generate-code.ts --length 6` — `length` field equals 6, code is 6 digits
    4. Exclude codes: `tsx src/worker-tools/sifely/generate-code.ts --exclude-codes "1221,2332,4554"` — generated code is NOT in the exclusion list
    5. Run 10 iterations with `--exclude-codes "1221"` — verify `code !== "1221"` every time

  **Must NOT do**:
  - Do not change the code generation algorithm
  - Do not change the JSON output format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T19-T21, T23)
  - **Blocks**: None
  - **Blocked By**: T18

  **References**:
  - `src/worker-tools/sifely/generate-code.ts` — the tool being tested
  - `src/worker-tools/sifely/rotate-property-code.ts:250-251` — downstream consumer that parses this tool's output

  **Acceptance Criteria**:
  - [ ] All 5 runs exit 0
  - [ ] Every output has `code` (string), `pattern` (string), `length` (number), `description` (string)
  - [ ] `--length 5` produces a 5-digit code, `--length 6` produces a 6-digit code
  - [ ] `--exclude-codes` never produces an excluded code (10 iterations)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: generate-code produces correct output across all parameter variations
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/generate-code.ts > /tmp/gc-default.json` — parse, assert fields
      2. Run `tsx src/worker-tools/sifely/generate-code.ts --length 5 > /tmp/gc-len5.json` — assert length=5 and code is 5 chars
      3. Run `tsx src/worker-tools/sifely/generate-code.ts --length 6 > /tmp/gc-len6.json` — assert length=6 and code is 6 chars
      4. Loop 10 times: `tsx src/worker-tools/sifely/generate-code.ts --exclude-codes "1221"` — assert code !== "1221" each time
    Expected Result: All parameter variations produce valid, correct output
    Failure Indicators: Missing fields, wrong length, excluded code appears
    Evidence: .sisyphus/evidence/task-22-generate-code.txt
  ```

  **Commit**: NO (verification only)

- [ ] 23. Live test `diagnose-access.ts` against Sifely + Hostfully API

  **What to do**:
  - Requires BOTH Sifely credentials AND Hostfully credentials
  - Set env vars:
    - `SIFELY_USERNAME=admin@vlrealestate.co`, `SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58`
    - `HOSTFULLY_API_KEY` — fetch from tenant secrets: `curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets"` and extract the `hostfully_api_key` value. If gateway is not running or key is unavailable, skip this test and document why.
  - Run `tsx src/worker-tools/sifely/diagnose-access.ts --property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
  - Verify:
    1. Exit code is 0
    2. Output is valid JSON
    3. Output contains `propertyId`, `locks` array, and a `summary` section
    4. At least one lock appears in the `locks` array (test lock `24572672` should be there)
    5. Each lock entry has `lockId`, `lockName`, `passcodes` array, and `diagnosis` fields
  - If Hostfully credentials are unavailable, document the skip and mark as conditional pass

  **Must NOT do**:
  - Do not modify any data
  - Do not test on any property other than `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with T19-T22)
  - **Blocks**: None
  - **Blocked By**: T18

  **References**:
  - `src/worker-tools/sifely/diagnose-access.ts` — the tool being tested
  - `AGENTS.md` — test property UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`

  **Acceptance Criteria**:
  - [ ] Exit code 0 (or documented skip if Hostfully credentials unavailable)
  - [ ] Output parses as valid JSON
  - [ ] Output contains `propertyId`, `locks` array
  - [ ] Test lock `24572672` appears in the locks array

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: diagnose-access produces valid diagnosis for test property
    Tool: Bash
    Preconditions: SIFELY + HOSTFULLY credentials available. If HOSTFULLY_API_KEY unavailable, skip and document.
    Steps:
      1. Fetch HOSTFULLY_API_KEY from admin API (or use env var if available)
      2. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 HOSTFULLY_API_KEY=$HOSTFULLY_API_KEY tsx src/worker-tools/sifely/diagnose-access.ts --property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2 > /tmp/diagnose-output.json`
      3. Assert exit code 0
      4. Parse JSON — assert has `propertyId`, `locks` (array), at least one lock with `lockId`
      5. Find test lock 24572672 in locks array — assert present
    Expected Result: Valid JSON diagnosis containing the test lock with passcode and access data
    Failure Indicators: Exit code non-0, JSON parse error, missing test lock, missing required fields
    Evidence: .sisyphus/evidence/task-23-diagnose-access.txt

  Scenario: diagnose-access skipped (conditional — only if credentials unavailable)
    Tool: Bash
    Steps:
      1. Document: "Hostfully API key not available — diagnose-access test skipped"
    Expected Result: Documented skip with reason
    Evidence: .sisyphus/evidence/task-23-diagnose-access-skip.txt
  ```

  **Commit**: NO (verification only)

- [ ] 24. Live test `create-passcode.ts` — create permanent passcode on test lock

  **What to do**:
  - **SAFETY**: Use ONLY lock ID `24572672`. No other lock.
  - Set Sifely credentials as env vars
  - Run `tsx src/worker-tools/sifely/create-passcode.ts --lock-id 24572672 --name "E2E-Test-Smoke" --code "8228"`
  - Verify:
    1. Exit code is 0
    2. Output is valid JSON: `{ "keyboardPwdId": <number> }` (or `{ "keyboardPwdId": <number>, "existed": true }` if already exists from a prior run)
    3. Capture the `keyboardPwdId` value — save to `.sisyphus/evidence/task-24-passcode-id.txt`
  - **Post-create verification**: Run `list-passcodes.ts --lock-id 24572672`, find the passcode by name "E2E-Test-Smoke":
    1. Assert `keyboardPwdType === 2` (permanent, NOT timed)
    2. Assert `keyboardPwd === "8228"` (the code we specified)
  - **DO NOT delete the passcode** — T25 and T26 depend on it existing

  **Must NOT do**:
  - Do not use any lock ID other than `24572672`
  - Do not delete the created passcode (T26 does that)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8 (sequential — T24 → T25 → T26)
  - **Blocks**: T25
  - **Blocked By**: T19, T20, T21

  **References**:
  - `src/worker-tools/sifely/create-passcode.ts` — the tool being tested
  - `docs/guides/2026-05-13-2157-sifely-lock-management-guide.md:28-44` — endDate/type behavior table

  **Acceptance Criteria**:
  - [ ] Exit code 0
  - [ ] Output contains `keyboardPwdId` (number)
  - [ ] Post-create list shows passcode with `keyboardPwdType === 2`
  - [ ] Post-create list shows passcode with `keyboardPwd === "8228"`
  - [ ] Passcode ID saved to evidence file

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: create-passcode creates a permanent type-2 passcode
    Tool: Bash
    Preconditions: SIFELY_USERNAME and SIFELY_PASSWORD set
    Steps:
      1. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/create-passcode.ts --lock-id 24572672 --name "E2E-Test-Smoke" --code "8228" > /tmp/create-passcode-output.json`
      2. Assert exit code 0
      3. Parse JSON — extract keyboardPwdId, save to `.sisyphus/evidence/task-24-passcode-id.txt`
      4. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672 > /tmp/verify-create.json`
      5. Parse JSON — find entry where keyboardPwdName === "E2E-Test-Smoke"
      6. Assert: keyboardPwdType === 2, keyboardPwd === "8228"
    Expected Result: Passcode created as permanent (type 2) with correct code
    Failure Indicators: Exit code non-0, keyboardPwdType !== 2, code mismatch, passcode not found in list
    Evidence: .sisyphus/evidence/task-24-create-passcode.txt
  ```

  **Commit**: NO (verification only)

- [ ] 25. Live test `update-passcode.ts` — update the test passcode

  **What to do**:
  - **SAFETY**: Use ONLY lock ID `24572672`. No other lock.
  - Set Sifely credentials as env vars
  - **Discover the test passcode**: Run `list-passcodes.ts --lock-id 24572672`, find the passcode named "E2E-Test-Smoke", extract its `keyboardPwdId`
  - Run `tsx src/worker-tools/sifely/update-passcode.ts --lock-id 24572672 --passcode-id <discovered-id> --name "E2E-Test-Updated" --code "9339"`
  - Verify:
    1. Exit code is 0
    2. Output is `{ "ok": true }`
  - **Post-update verification**: Run `list-passcodes.ts --lock-id 24572672`, find the passcode by ID:
    1. Assert name changed to `"E2E-Test-Updated"`
    2. Assert code changed to `"9339"`
    3. Assert `keyboardPwdType` still equals `2` (type should NOT change on update)
  - **DO NOT delete the passcode** — T26 depends on it

  **Must NOT do**:
  - Do not use any lock ID other than `24572672`
  - Do not delete the passcode (T26 does that)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8 (sequential — T24 → T25 → T26)
  - **Blocks**: T26
  - **Blocked By**: T24

  **References**:
  - `src/worker-tools/sifely/update-passcode.ts` — the tool being tested
  - `src/worker-tools/sifely/list-passcodes.ts` — used for discovery and verification

  **Acceptance Criteria**:
  - [ ] Passcode discovered by name "E2E-Test-Smoke" from list-passcodes
  - [ ] Exit code 0
  - [ ] Output is `{ "ok": true }`
  - [ ] Post-update list shows name changed to "E2E-Test-Updated"
  - [ ] Post-update list shows code changed to "9339"
  - [ ] `keyboardPwdType` remains `2` after update

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: update-passcode changes name and code on test passcode
    Tool: Bash
    Preconditions: SIFELY credentials set. Passcode "E2E-Test-Smoke" exists on lock 24572672 (created by T24).
    Steps:
      1. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672 > /tmp/discover-passcode.json`
      2. Parse JSON — find entry where keyboardPwdName === "E2E-Test-Smoke", extract keyboardPwdId
      3. Assert: passcode found (if not, T24 failed — abort)
      4. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/update-passcode.ts --lock-id 24572672 --passcode-id <id> --name "E2E-Test-Updated" --code "9339" > /tmp/update-output.json`
      5. Assert exit code 0, output contains `"ok": true`
      6. Run list-passcodes again — find by ID, assert name === "E2E-Test-Updated", code === "9339", keyboardPwdType === 2
    Expected Result: Passcode name and code updated, type preserved as permanent
    Failure Indicators: Passcode not found, exit code non-0, name/code not changed, type changed from 2
    Evidence: .sisyphus/evidence/task-25-update-passcode.txt
  ```

  **Commit**: NO (verification only)

- [ ] 26. Live test `delete-passcode.ts` — delete the test passcode + verify cleanup

  **What to do**:
  - **SAFETY**: Use ONLY lock ID `24572672`. No other lock.
  - Set Sifely credentials as env vars
  - **Discover the test passcode**: Run `list-passcodes.ts --lock-id 24572672`, find the passcode named "E2E-Test-Updated" (renamed in T25), extract its `keyboardPwdId`
  - Run `tsx src/worker-tools/sifely/delete-passcode.ts --lock-id 24572672 --passcode-id <discovered-id>`
  - Verify:
    1. Exit code is 0
    2. Output is `{ "ok": true }`
  - **Post-delete verification**: Run `list-passcodes.ts --lock-id 24572672`:
    1. Assert the deleted passcode ID does NOT appear in the list
    2. Assert no passcode named "E2E-Test-Updated" or "E2E-Test-Smoke" exists (clean state)
  - This is the final task in the CRUD lifecycle — the test lock is now clean

  **Must NOT do**:
  - Do not use any lock ID other than `24572672`
  - Do not delete any passcode OTHER than the one created in T24

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8 (sequential — T24 → T25 → T26)
  - **Blocks**: F1-F4
  - **Blocked By**: T25

  **References**:
  - `src/worker-tools/sifely/delete-passcode.ts` — the tool being tested
  - `src/worker-tools/sifely/list-passcodes.ts` — used for discovery and verification

  **Acceptance Criteria**:
  - [ ] Passcode discovered by name "E2E-Test-Updated" from list-passcodes
  - [ ] Exit code 0
  - [ ] Output is `{ "ok": true }`
  - [ ] Post-delete list does NOT contain the deleted passcode ID
  - [ ] No passcode named "E2E-Test-Smoke" or "E2E-Test-Updated" remains on the lock

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: delete-passcode removes test passcode and leaves lock clean
    Tool: Bash
    Preconditions: SIFELY credentials set. Passcode "E2E-Test-Updated" exists on lock 24572672 (created T24, updated T25).
    Steps:
      1. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672 > /tmp/discover-for-delete.json`
      2. Parse JSON — find entry where keyboardPwdName === "E2E-Test-Updated", extract keyboardPwdId
      3. Assert: passcode found (if not, T25 failed — abort)
      4. Run `SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 tsx src/worker-tools/sifely/delete-passcode.ts --lock-id 24572672 --passcode-id <id> > /tmp/delete-output.json`
      5. Assert exit code 0, output contains `"ok": true`
      6. Run list-passcodes again — assert NO entry has keyboardPwdName containing "E2E-Test"
    Expected Result: Passcode deleted, lock clean, no orphaned test data
    Failure Indicators: Passcode not found, exit code non-0, passcode still present after delete
    Evidence: .sisyphus/evidence/task-26-delete-passcode.txt
  ```

  **Commit**: NO (verification only)

- [ ] 27. **Notify completion** — Send Telegram notification: plan `sifely-tool-restructure` complete, all tasks done, come back to review results.

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify every `lib/api.ts` import resolves correctly.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `--help` on EVERY new tool inside Docker container. Run `pnpm prisma db seed` twice (idempotency). Verify `rotate-property-code.ts --help` still works. Verify `diagnose-access.ts --help` still works. Check no orphaned files in old `locks/` directory. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Tools [N/N help pass] | Seed [idempotent/broken] | Orphans [CLEAN/N files] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Verify no `--type timed` anywhere in new tools. Verify no files remain at `src/worker-tools/locks/`. Verify `sifely-client.ts` is fully deleted.
      Output: `Tasks [N/N compliant] | Guardrails [N/N clean] | Orphans [CLEAN/N] | VERDICT`

---

## Commit Strategy

| Wave | Commit      | Message                                                                                    | Files                                                                             | Pre-commit                        |
| ---- | ----------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------- |
| 1    | YES         | `refactor(worker-tools): rename locks/ to sifely/`                                         | All files in sifely/                                                              | `pnpm lint`                       |
| 2    | YES (group) | `refactor(worker-tools): add shared sifely lib, move hostfully tools, clean generate-code` | lib/api.ts, hostfully tools, generate-code.ts                                     | `pnpm lint`                       |
| 3+4  | YES (group) | `refactor(worker-tools): split sifely-client into individual tools`                        | 6 new tools, diagnose-access.ts, rotate-property-code.ts, delete sifely-client.ts | `pnpm lint`                       |
| 5    | YES (group) | `refactor: update all references for sifely tool restructure`                              | Dockerfile, seed.ts, AGENTS.md, tests, docs                                       | `pnpm lint && pnpm test -- --run` |
| 6    | NO          | Integration verification only — no new code                                                | —                                                                                 | —                                 |

---

## Success Criteria

### Verification Commands

```bash
pnpm lint                    # Expected: 0 errors
pnpm build                   # Expected: clean compile
pnpm test -- --run           # Expected: same pass count as baseline
pnpm prisma db seed          # Expected: exit 0
docker build -t ai-employee-worker:latest .  # Expected: success
```

### Final Checklist

- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (grep verified)
- [ ] All tests pass
- [ ] No files remain at `src/worker-tools/locks/`
- [ ] No `sifely-client.ts` exists
- [ ] Docker image builds and all tools respond to `--help` inside container
- [ ] Database re-seeded with new tool paths
- [ ] AGENTS.md accurately reflects new tool structure
