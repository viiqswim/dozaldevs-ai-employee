# HF-01: Hostfully API Authentication

## TL;DR

> **Quick Summary**: Securely store Hostfully API credentials (`hostfully_api_key` + `hostfully_agency_uid`) per tenant via the existing `tenant_secrets` infrastructure, create a shell tool scaffold at `src/worker-tools/hostfully/` that validates env var presence, update the Dockerfile to include it, and verify end-to-end with automated tests + live API calls.
>
> **Deliverables**:
>
> - `src/worker-tools/hostfully/validate-env.ts` — CLI script validating `HOSTFULLY_API_KEY` + `HOSTFULLY_AGENCY_UID` presence
> - Dockerfile updated to copy hostfully tools to `/tools/hostfully/`
> - New test files for env-loader mapping and shell tool behavior
> - VLRE tenant secrets stored via admin API
>
> **Estimated Effort**: Quick (S complexity — hours to 1 day)
> **Parallel Execution**: YES — 2 waves + final verification
> **Critical Path**: Task 1 (shell tool) → Task 3 (Dockerfile) → Task 5 (Docker QA)

---

## Context

### Original Request

Implement HF-01 from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). This is the foundational story that unblocks all Hostfully shell tools (HF-02 through HF-06) and the Guest Messaging employee pipeline.

### Interview Summary

**Key Discussions**:

- Platform already handles 80% generically — `loadTenantEnv()` uppercases ALL tenant secrets and injects them into Fly.io machine env. Zero changes needed to that function.
- `PUT /admin/tenants/:tenantId/secrets/:key` already accepts any key matching `/^[a-z0-9_]+$/` — both `hostfully_api_key` and `hostfully_agency_uid` pass validation.
- Standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee` has the Hostfully client and credentials.
- VLRE Hostfully API key: `Y6EQ7KgSwoOGCokD`, Agency UID: `942d08d9-82bb-4fd3-9091-ca0c6b50b578`.
- Shell tool scope: env-validation only, NO HTTP calls (live API calls are HF-02+ work).
- Test strategy: tests alongside implementation (not TDD).

**Research Findings**:

- `loadTenantEnv()` line 39-41: generic uppercasing of all secrets — no whitelist or mapping needed
- Dockerfile pattern: `mkdir -p /tools/slack` → `COPY --from=builder` → `npm install --prefix` (npm install only when deps exist)
- Shell tools are TypeScript compiled to JS, arg parsing via `process.argv`, exit(1) on error with stderr
- The validate-env tool needs zero npm dependencies (pure Node.js built-ins) — Dockerfile only needs `mkdir` + `COPY`
- Hostfully auth uses `X-HOSTFULLY-APIKEY` header — API key + agency UID needed, API URL is a constant default

### Metis Review

**Identified Gaps** (addressed):

- Shell tool scope ambiguity → Resolved: env-validation only, no HTTP calls
- `hostfully_agency_uid` not truly secret → Store in `tenant_secrets` for consistency with existing pattern (path of least resistance)
- npm deps decision → No deps needed for env-validation script, Dockerfile gets 2 lines not 3
- `HOSTFULLY_API_URL` placement → Deferred to HF-02+ (hardcoded constant in future tools, not a secret)
- Secret key collision with platform env vars → Pre-existing systemic issue, not HF-01's problem. Noted as known limitation.
- New test files only — do not modify existing test files

---

## Work Objectives

### Core Objective

Enable per-tenant Hostfully API authentication by storing credentials as encrypted tenant secrets, injecting them into worker machines as env vars, and creating a shell tool scaffold that validates their presence — laying the foundation for all Hostfully integration stories (HF-02 through HF-06).

### Concrete Deliverables

- `src/worker-tools/hostfully/validate-env.ts` compiled to `/tools/hostfully/validate-env.js` in Docker image
- `tests/worker-tools/hostfully/validate-env.test.ts` — shell tool unit tests
- `tests/gateway/services/hostfully-env-injection.test.ts` — env-loader integration test for Hostfully keys
- Updated `Dockerfile` with hostfully tool copy commands
- VLRE tenant secrets `hostfully_api_key` and `hostfully_agency_uid` stored via admin API

### Definition of Done

- [ ] `pnpm build` succeeds with the new TypeScript file
- [ ] `pnpm test -- --run` passes with all new tests green
- [ ] Docker image contains `/tools/hostfully/validate-env.js`
- [ ] Shell tool exits 0 when both env vars are present, exits 1 with clear stderr when either is missing
- [ ] VLRE tenant has both Hostfully secrets stored (verifiable via `GET /admin/tenants/.../secrets`)

### Must Have

- Both `hostfully_api_key` and `hostfully_agency_uid` stored as tenant secrets for VLRE
- Shell tool validates BOTH env vars (not just the API key)
- Clear, specific error messages in stderr when env vars are missing
- Tests covering: env-loader mapping, shell tool success, shell tool failure for each missing var
- Dockerfile updated to include hostfully tools

### Must NOT Have (Guardrails)

- **No modifications to `src/gateway/services/tenant-env-loader.ts`** — it's already correct and generic
- **No modifications to `prisma/seed.ts`** — secrets are operational data, not seed data
- **No modifications to existing test files** — add new test files only
- **No HTTP calls in the shell tool** — actual Hostfully API calls are HF-02+ work
- **No new archetype record** — the Guest Messaging archetype is GM-01 work
- **No `hostfully_api_key` in `PLATFORM_ENV_WHITELIST`** — it's a tenant secret, not a platform env var
- **No npm dependencies for the validate-env tool** — pure Node.js built-ins only
- **No shebang/chmod on the shell tool** — always invoked as `node /tools/hostfully/validate-env.js`
- **No AI slop**: no excessive comments, no over-abstraction, no generic variable names

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (tests alongside implementation)
- **Framework**: Vitest
- **New test files**: `tests/worker-tools/hostfully/validate-env.test.ts`, `tests/gateway/services/hostfully-env-injection.test.ts`

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run `node` with/without env vars, check exit code + stderr
- **API endpoints**: Use Bash (curl) — send requests, assert HTTP status codes + response body
- **Docker image**: Use Bash — `docker run --rm` to verify tool presence and behavior
- **Unit tests**: Use Bash — `pnpm test -- --run` and check output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — code + tests, MAX PARALLEL):
├── Task 1: Create validate-env shell tool [quick]
├── Task 2: Add env-loader integration test [quick]
└── Task 3: Update Dockerfile [quick]

Wave 2 (After Wave 1 — verification + secrets):
├── Task 4: Build verification + full test run [quick]
└── Task 5: Store VLRE secrets + API verification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 4 → Task 5 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 3, 4   | 1    |
| 2    | —          | 4      | 1    |
| 3    | 1          | 4, 5   | 1    |
| 4    | 1, 2, 3    | 5      | 2    |
| 5    | 4          | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2 tasks** — T4 → `quick`, T5 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create validate-env shell tool + unit tests

  **What to do**:
  - Create `src/worker-tools/hostfully/validate-env.ts` following the exact pattern of `src/worker-tools/slack/post-message.ts`:
    - `parseArgs(argv)` function parsing `--help` flag
    - `main()` async function as entry point
    - `process.exit(1)` with `process.stderr.write()` on errors
    - `process.stdout.write()` for success output
  - The script must:
    - Read `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID` from `process.env`
    - If `HOSTFULLY_API_KEY` is missing/empty: exit 1 with stderr `"Error: HOSTFULLY_API_KEY environment variable is required\n"`
    - If `HOSTFULLY_AGENCY_UID` is missing/empty: exit 1 with stderr `"Error: HOSTFULLY_AGENCY_UID environment variable is required\n"`
    - If both are present: write `{"ok":true,"apiKeySet":true,"agencyUidSet":true}` to stdout and exit 0
    - Support `--help` flag printing usage info
  - Create `tests/worker-tools/hostfully/validate-env.test.ts` with tests:
    - Test: exits 0 and outputs JSON when both vars are set
    - Test: exits 1 with specific error when `HOSTFULLY_API_KEY` is missing
    - Test: exits 1 with specific error when `HOSTFULLY_AGENCY_UID` is missing
    - Test: exits 1 when both vars are missing (first error is about API key)
    - Test: empty string counts as missing
  - Testing approach: use `child_process.execFile` to invoke the compiled JS with controlled env vars (matching how shell tools are actually invoked)

  **Must NOT do**:
  - Make any HTTP calls to Hostfully or any external service
  - Add npm dependencies — this is pure Node.js built-ins only
  - Add a shebang line or chmod +x — always invoked via `node`
  - Create a reusable TypeScript module/class — this is a CLI script
  - Over-abstract or create unnecessary helper functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file creation following an established pattern, < 50 lines of code + tests
  - **Skills**: `[]`
    - No special skills needed — straightforward TypeScript file creation
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — simple file creation, no git history analysis

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/worker-tools/slack/post-message.ts` — Full shell tool pattern: `parseArgs()`, `main()`, `process.stderr.write()` for errors, `process.stdout.write()` for output, `process.exit(1)` on failure. Copy this structure exactly.
  - `src/worker-tools/slack/post-message.ts:81-85` — Token validation pattern: check env var, write specific error to stderr, exit 1. Use the same pattern for `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID`.

  **Test References** (testing patterns to follow):
  - For the child_process approach: the test should compile the file first (or use the built `dist/` path) and invoke it with `execFile('node', [scriptPath], {env: {...}})` to test exit codes and stderr/stdout. If this pattern doesn't exist in the codebase, use Vitest's `vi.stubEnv()` approach instead to test the validation logic directly.

  **Acceptance Criteria**:
  - [ ] File exists: `src/worker-tools/hostfully/validate-env.ts`
  - [ ] File exists: `tests/worker-tools/hostfully/validate-env.test.ts`
  - [ ] `pnpm build` succeeds (new TS file compiles)
  - [ ] `pnpm test -- --run tests/worker-tools/hostfully/` → PASS (all 5 tests)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Shell tool validates both env vars present
    Tool: Bash
    Preconditions: pnpm build has completed successfully
    Steps:
      1. Run: HOSTFULLY_API_KEY=testkey HOSTFULLY_AGENCY_UID=testuid node dist/worker-tools/hostfully/validate-env.js
      2. Capture exit code and stdout
    Expected Result: Exit code 0, stdout contains '{"ok":true'
    Failure Indicators: Non-zero exit code, or stdout is empty/missing JSON
    Evidence: .sisyphus/evidence/task-1-validate-env-success.txt

  Scenario: Shell tool fails when HOSTFULLY_API_KEY is missing
    Tool: Bash
    Preconditions: pnpm build has completed successfully
    Steps:
      1. Run: HOSTFULLY_AGENCY_UID=testuid node dist/worker-tools/hostfully/validate-env.js 2>&1; echo "EXIT:$?"
      2. Capture stderr and exit code
    Expected Result: Output contains "HOSTFULLY_API_KEY" and "EXIT:1"
    Failure Indicators: Exit code 0, or error message doesn't mention HOSTFULLY_API_KEY
    Evidence: .sisyphus/evidence/task-1-validate-env-missing-key.txt

  Scenario: Shell tool fails when HOSTFULLY_AGENCY_UID is missing
    Tool: Bash
    Preconditions: pnpm build has completed successfully
    Steps:
      1. Run: HOSTFULLY_API_KEY=testkey node dist/worker-tools/hostfully/validate-env.js 2>&1; echo "EXIT:$?"
      2. Capture stderr and exit code
    Expected Result: Output contains "HOSTFULLY_AGENCY_UID" and "EXIT:1"
    Failure Indicators: Exit code 0, or error message doesn't mention HOSTFULLY_AGENCY_UID
    Evidence: .sisyphus/evidence/task-1-validate-env-missing-uid.txt

  Scenario: Unit tests pass
    Tool: Bash
    Preconditions: Source files created
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/hostfully/validate-env.test.ts
      2. Capture output
    Expected Result: All tests pass (5 tests, 0 failures)
    Failure Indicators: Any test failure or "FAIL" in output
    Evidence: .sisyphus/evidence/task-1-unit-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-validate-env-success.txt
  - [ ] task-1-validate-env-missing-key.txt
  - [ ] task-1-validate-env-missing-uid.txt
  - [ ] task-1-unit-tests.txt

  **Commit**: YES
  - Message: `feat(hostfully): add validate-env shell tool for API key presence check`
  - Files: `src/worker-tools/hostfully/validate-env.ts`, `tests/worker-tools/hostfully/validate-env.test.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run tests/worker-tools/hostfully/`

- [x] 2. Add env-loader integration test for Hostfully secret injection

  **What to do**:
  - Create `tests/gateway/services/hostfully-env-injection.test.ts`
  - Use the EXACT same mock pattern as `tests/gateway/services/tenant-env-loader.test.ts`:
    - `makeTenant()` helper for mock tenant objects
    - `makeDeps()` helper with `findById`, `listKeys`, `getMany` mock functions
    - `beforeEach`/`afterEach` for `process.env` isolation
  - Tests to include:
    - `hostfully_api_key` in tenant_secrets → env output has `HOSTFULLY_API_KEY` (uppercased)
    - `hostfully_agency_uid` in tenant_secrets → env output has `HOSTFULLY_AGENCY_UID` (uppercased)
    - Both secrets present → both mapped correctly
    - Lowercase originals (`hostfully_api_key`) do NOT appear in output (only uppercased versions)
    - Two tenants with different Hostfully keys get different env maps (isolation)
  - Import `loadTenantEnv` from `src/gateway/services/tenant-env-loader.ts` — do NOT modify the source file

  **Must NOT do**:
  - Modify `src/gateway/services/tenant-env-loader.ts` in any way
  - Modify `tests/gateway/services/tenant-env-loader.test.ts` — this is a NEW test file
  - Test any Hostfully API behavior — only test env variable mapping

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single test file, copying an established mock pattern exactly
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `tests/gateway/services/tenant-env-loader.test.ts` — ENTIRE FILE is the reference. Copy the `makeTenant()`, `makeDeps()` helpers verbatim. Copy the `beforeEach`/`afterEach` env isolation pattern. Use the same import path for `loadTenantEnv`. The test at line 75-92 (`'uppercases secret keys in output'`) is the closest pattern — adapt it for hostfully keys.
  - `tests/gateway/services/tenant-env-loader.test.ts:122-159` — Two-tenant isolation test pattern. Copy this for the Hostfully isolation test.

  **API/Type References**:
  - `src/gateway/services/tenant-env-loader.ts:17-20` — `loadTenantEnv` function signature: `(tenantId: string, deps: { tenantRepo: TenantRepository; secretRepo: TenantSecretRepository }) → Promise<Record<string, string>>`
  - `src/gateway/services/tenant-env-loader.ts:39-41` — The generic uppercasing logic: `for (const [key, value] of Object.entries(secrets)) { env[key.toUpperCase()] = value; }` — this is what the tests verify

  **Acceptance Criteria**:
  - [ ] File exists: `tests/gateway/services/hostfully-env-injection.test.ts`
  - [ ] `pnpm test -- --run tests/gateway/services/hostfully-env-injection.test.ts` → PASS (5 tests, 0 failures)
  - [ ] `src/gateway/services/tenant-env-loader.ts` is NOT modified (diff shows zero changes)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Hostfully env injection tests pass
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Run: pnpm test -- --run tests/gateway/services/hostfully-env-injection.test.ts
      2. Capture output and exit code
    Expected Result: Exit code 0, output shows 5 passing tests, 0 failures
    Failure Indicators: Any test failure, import errors, or "Cannot find module"
    Evidence: .sisyphus/evidence/task-2-env-injection-tests.txt

  Scenario: Existing env-loader tests still pass (no regression)
    Tool: Bash
    Preconditions: No modifications to existing files
    Steps:
      1. Run: pnpm test -- --run tests/gateway/services/tenant-env-loader.test.ts
      2. Capture output and exit code
    Expected Result: Exit code 0, all existing tests still pass
    Failure Indicators: Any test that passed before now fails
    Evidence: .sisyphus/evidence/task-2-existing-tests-no-regression.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-env-injection-tests.txt
  - [ ] task-2-existing-tests-no-regression.txt

  **Commit**: YES
  - Message: `test(hostfully): add env-loader integration test for Hostfully secret injection`
  - Files: `tests/gateway/services/hostfully-env-injection.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/services/hostfully-env-injection.test.ts`

- [x] 3. Update Dockerfile to include hostfully shell tools

  **What to do**:
  - Add 2 lines to the `Dockerfile` AFTER the existing slack tools block (after line 61: `RUN npm install --prefix /tools/slack @slack/web-api@^7.15.1`):
    ```dockerfile
    RUN mkdir -p /tools/hostfully
    COPY --from=builder /build/dist/worker-tools/hostfully/validate-env.js /tools/hostfully/validate-env.js
    ```
  - Note: NO `npm install --prefix /tools/hostfully` needed — validate-env.ts has zero npm dependencies
  - Add a blank line before the new block for readability (matching the style between existing blocks)

  **Must NOT do**:
  - Modify any existing Dockerfile lines
  - Add `npm install --prefix /tools/hostfully` (no deps to install)
  - Add `chmod +x` or shebang support
  - Move or reorder existing COPY commands

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding 2 lines to an existing file in a clear, specified location
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES (but logically depends on Task 1 existing)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2) — can be done in parallel since the source file is created by Task 1 and the Dockerfile just references the expected output path
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Task 1 (the source file must exist for docker build to succeed)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `Dockerfile:58-61` — The exact pattern to replicate:
    ```dockerfile
    RUN mkdir -p /tools/slack
    COPY --from=builder /build/dist/worker-tools/slack/read-channels.js /tools/slack/read-channels.js
    COPY --from=builder /build/dist/worker-tools/slack/post-message.js /tools/slack/post-message.js
    RUN npm install --prefix /tools/slack @slack/web-api@^7.15.1
    ```
    Follow this exactly, but omit the `npm install` line (no deps for hostfully validate-env).

  **Acceptance Criteria**:
  - [ ] `Dockerfile` contains `RUN mkdir -p /tools/hostfully`
  - [ ] `Dockerfile` contains `COPY --from=builder /build/dist/worker-tools/hostfully/validate-env.js /tools/hostfully/validate-env.js`
  - [ ] No existing Dockerfile lines are modified
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds (requires Task 1 complete)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dockerfile contains correct hostfully lines
    Tool: Bash
    Preconditions: Dockerfile has been edited
    Steps:
      1. Run: grep "tools/hostfully" Dockerfile
      2. Count matching lines
    Expected Result: Exactly 2 lines: mkdir and COPY
    Failure Indicators: 0 lines (not added), or lines reference wrong paths
    Evidence: .sisyphus/evidence/task-3-dockerfile-grep.txt

  Scenario: Docker image builds successfully
    Tool: Bash (tmux — long-running)
    Preconditions: Task 1 is complete (validate-env.ts exists), pnpm build has run
    Steps:
      1. Run in tmux: docker build -t ai-employee-worker:latest .
      2. Wait for completion (timeout: 5 minutes)
      3. Check exit code
    Expected Result: Exit code 0, image builds without errors
    Failure Indicators: COPY failure, build error, non-zero exit code
    Evidence: .sisyphus/evidence/task-3-docker-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-dockerfile-grep.txt
  - [ ] task-3-docker-build.txt

  **Commit**: YES
  - Message: `build(docker): add hostfully shell tools to worker image`
  - Files: `Dockerfile`
  - Pre-commit: `docker build -t ai-employee-worker:latest .`

- [x] 4. Build verification + full test suite run

  **What to do**:
  - Run `pnpm build` — verify all new TypeScript compiles
  - Run `pnpm test -- --run` — verify ALL tests pass (new + existing)
  - Run `docker build -t ai-employee-worker:latest .` — verify Docker image builds with hostfully tools
  - Verify Docker image contents:
    - `docker run --rm ai-employee-worker:latest ls /tools/hostfully/validate-env.js`
    - `docker run --rm ai-employee-worker:latest node /tools/hostfully/validate-env.js 2>&1; echo "EXIT:$?"` (should fail — no env vars in container)
    - `docker run --rm -e HOSTFULLY_API_KEY=test -e HOSTFULLY_AGENCY_UID=test ai-employee-worker:latest node /tools/hostfully/validate-env.js; echo "EXIT:$?"` (should succeed)
  - This is a verification gate — if anything fails, the responsible task must be fixed before proceeding

  **Must NOT do**:
  - Modify any source files — this is verification only
  - Skip the Docker image verification
  - Continue to Task 5 if any check fails

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running pre-defined verification commands, no code changes
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential gate)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `Dockerfile:58-61` — Slack tools block, to verify hostfully block follows the same pattern
  - `Success Criteria` section of this plan — contains all verification commands

  **Acceptance Criteria**:
  - [ ] `pnpm build` → exit 0
  - [ ] `pnpm test -- --run` → all tests pass, no regressions
  - [ ] `docker build -t ai-employee-worker:latest .` → exit 0
  - [ ] `/tools/hostfully/validate-env.js` exists in Docker image
  - [ ] Shell tool exits 1 without env vars, exits 0 with them

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript build succeeds
    Tool: Bash
    Preconditions: All source files from Tasks 1-3 are committed
    Steps:
      1. Run: pnpm build 2>&1; echo "EXIT:$?"
    Expected Result: Output contains "EXIT:0", no TypeScript errors
    Failure Indicators: "error TS", non-zero exit code
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: pnpm build succeeded
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -30
      2. Check for test count and pass/fail summary
    Expected Result: All new tests pass, no previously-passing tests now fail
    Failure Indicators: "FAIL" in output for non-pre-existing failures
    Evidence: .sisyphus/evidence/task-4-test-suite.txt

  Scenario: Docker image contains hostfully tool and it works
    Tool: Bash
    Preconditions: Docker image built successfully
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest ls -la /tools/hostfully/
      2. Run: docker run --rm ai-employee-worker:latest node /tools/hostfully/validate-env.js 2>&1; echo "EXIT:$?"
      3. Run: docker run --rm -e HOSTFULLY_API_KEY=test -e HOSTFULLY_AGENCY_UID=test ai-employee-worker:latest node /tools/hostfully/validate-env.js; echo "EXIT:$?"
    Expected Result: Step 1 lists validate-env.js. Step 2 shows error + EXIT:1. Step 3 shows JSON + EXIT:0.
    Failure Indicators: File not found, wrong exit codes, missing error messages
    Evidence: .sisyphus/evidence/task-4-docker-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-build.txt
  - [ ] task-4-test-suite.txt
  - [ ] task-4-docker-validation.txt

  **Commit**: NO (verification only — no code changes)

- [x] 5. Store VLRE Hostfully secrets via admin API + end-to-end verification

  **What to do**:
  - Ensure the gateway is running (check `curl -s http://localhost:7700/health`)
  - If gateway is not running, start it via `pnpm dev:start` in a tmux session
  - Read `ADMIN_API_KEY` from the `.env` file
  - Store the VLRE Hostfully API key:
    ```bash
    curl -X PUT \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"value":"Y6EQ7KgSwoOGCokD"}' \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_api_key"
    ```
  - Store the VLRE Hostfully agency UID:
    ```bash
    curl -X PUT \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"value":"942d08d9-82bb-4fd3-9091-ca0c6b50b578"}' \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_agency_uid"
    ```
  - Verify both secrets are stored:
    ```bash
    curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets"
    ```
  - Verify the secrets appear in the response with `hostfully_api_key` and `hostfully_agency_uid` keys
  - Verify cross-tenant isolation: DozalDevs tenant should NOT have hostfully secrets
    ```bash
    curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/secrets"
    ```

  **Must NOT do**:
  - Add secrets to `prisma/seed.ts`
  - Modify any database migration files
  - Store secrets anywhere other than via the admin API
  - Use the real API key in any code file, test file, or committed artifact

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running curl commands against a live API, no code changes
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 4 passes)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-tenant-secrets.ts:44-71` — PUT endpoint handler. Validates params, checks tenant exists, calls `secretRepo.set()`. Returns metadata (key, is_set, updated_at) — never returns the plaintext.
  - `src/gateway/services/tenant-secret-repository.ts:13-31` — `set()` method: encrypts via AES-256-GCM, upserts into `tenant_secrets` table.
  - `src/gateway/validation/schemas.ts:239-246` — `SecretKeyParamSchema`: key must match `/^[a-z0-9_]+$/`. Both `hostfully_api_key` and `hostfully_agency_uid` pass.

  **API/Type References**:
  - VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
  - DozalDevs tenant ID: `00000000-0000-0000-0000-000000000002`
  - Admin API base: `http://localhost:7700`
  - Auth header: `X-Admin-Key: $ADMIN_API_KEY`
  - Hostfully API key (from standalone MVP `.env`): `Y6EQ7KgSwoOGCokD`
  - Hostfully agency UID (from standalone MVP `.env`): `942d08d9-82bb-4fd3-9091-ca0c6b50b578`

  **Acceptance Criteria**:
  - [ ] PUT `hostfully_api_key` returns HTTP 200
  - [ ] PUT `hostfully_agency_uid` returns HTTP 200
  - [ ] GET secrets for VLRE lists both `hostfully_api_key` and `hostfully_agency_uid`
  - [ ] GET secrets for DozalDevs does NOT list hostfully secrets (tenant isolation)
  - [ ] Response bodies never contain plaintext secret values

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Store hostfully_api_key for VLRE tenant
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700, ADMIN_API_KEY set
    Steps:
      1. Run: curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"value":"Y6EQ7KgSwoOGCokD"}' "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_api_key"
      2. Check HTTP status and response body
    Expected Result: HTTP 200, response contains `"key":"hostfully_api_key"` and `"is_set":true`, response does NOT contain `Y6EQ7KgSwoOGCokD`
    Failure Indicators: Non-200 status, missing key in response, plaintext value leaked
    Evidence: .sisyphus/evidence/task-5-store-api-key.txt

  Scenario: Store hostfully_agency_uid for VLRE tenant
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. Run: curl -s -w "\nHTTP_STATUS:%{http_code}" -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"value":"942d08d9-82bb-4fd3-9091-ca0c6b50b578"}' "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_agency_uid"
      2. Check HTTP status and response body
    Expected Result: HTTP 200, response contains `"key":"hostfully_agency_uid"` and `"is_set":true`
    Failure Indicators: Non-200 status, or plaintext agency UID in response
    Evidence: .sisyphus/evidence/task-5-store-agency-uid.txt

  Scenario: Verify VLRE secrets list includes both Hostfully keys
    Tool: Bash (curl)
    Preconditions: Both PUT requests succeeded
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets"
      2. Parse JSON response
    Expected Result: HTTP 200, `secrets` array contains objects with keys `hostfully_api_key` and `hostfully_agency_uid`
    Failure Indicators: Missing keys, empty array, non-200 status
    Evidence: .sisyphus/evidence/task-5-list-vlre-secrets.txt

  Scenario: Tenant isolation — DozalDevs has no Hostfully secrets
    Tool: Bash (curl)
    Preconditions: VLRE secrets stored
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/secrets"
      2. Check that no hostfully keys appear
    Expected Result: HTTP 200, `secrets` array does NOT contain `hostfully_api_key` or `hostfully_agency_uid`
    Failure Indicators: Hostfully keys appear in DozalDevs tenant secrets
    Evidence: .sisyphus/evidence/task-5-tenant-isolation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-store-api-key.txt
  - [ ] task-5-store-agency-uid.txt
  - [ ] task-5-list-vlre-secrets.txt
  - [ ] task-5-tenant-isolation.txt

  **Commit**: NO (operational action — no code changes to commit)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/hf01-hostfully-auth.md` end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (secrets stored → env injected → shell tool reads them). Test edge cases: missing one secret but not both, empty string secret value. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Commit Message                                                                    | Files                                                                                             | Pre-commit Check                                                            |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1          | `feat(hostfully): add validate-env shell tool for API key presence check`         | `src/worker-tools/hostfully/validate-env.ts`, `tests/worker-tools/hostfully/validate-env.test.ts` | `pnpm build && pnpm test -- --run tests/worker-tools/hostfully/`            |
| 2          | `test(hostfully): add env-loader integration test for Hostfully secret injection` | `tests/gateway/services/hostfully-env-injection.test.ts`                                          | `pnpm test -- --run tests/gateway/services/hostfully-env-injection.test.ts` |
| 3          | `build(docker): add hostfully shell tools to worker image`                        | `Dockerfile`                                                                                      | `docker build -t ai-employee-worker:latest .`                               |
| 5          | No commit — operational action (storing secrets via API)                          | —                                                                                                 | —                                                                           |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exit 0, no errors
pnpm test -- --run            # Expected: all new tests pass, no regressions
docker build -t ai-employee-worker:latest .  # Expected: exit 0
docker run --rm ai-employee-worker:latest ls /tools/hostfully/validate-env.js  # Expected: file listed
docker run --rm ai-employee-worker:latest node /tools/hostfully/validate-env.js 2>&1; echo $?  # Expected: error message + exit 1
docker run --rm -e HOSTFULLY_API_KEY=test -e HOSTFULLY_AGENCY_UID=test ai-employee-worker:latest node /tools/hostfully/validate-env.js; echo $?  # Expected: exit 0
curl -s -w "\n%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets  # Expected: 200, lists hostfully_api_key and hostfully_agency_uid
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image builds and contains hostfully tools
- [ ] VLRE secrets accessible via admin API
