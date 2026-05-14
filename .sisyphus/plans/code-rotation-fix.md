# Plan: Code-Rotation Single-Property Tool + Archetype Fix

> **Context**: The code-rotation employee (built in plan `code-rotation-employee`) has two critical bugs:
>
> 1. It rotates ALL properties on every run — should only rotate properties with a checkout today
> 2. The Sifely `createPasscode` may produce type 3 (timed) instead of type 2 (permanent) passcodes
>
> **User directive**: "Create a single tool that handles changing the codes for the locks associated with a single property. Test it yourself until it works."
>
> **Plan file**: `.sisyphus/plans/code-rotation-fix.md` — READ ONLY (orchestrator-only)
> **Notepad**: `.sisyphus/notepads/code-rotation-fix/`

---

## Constraints

- `tsx` not in PATH — use `pnpm exec tsx` or `npx tsx`
- ONLY test on: Hostfully UID `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`, Sifely lock ID `24572672`
- Sifely credentials: `SIFELY_USERNAME=admin@vlrealestate.co`, `SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58`
- Hostfully API key: `HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD`
- Approved model: `minimax/minimax-m2.7` only
- Do NOT modify `generate-code.ts` or `update-door-code.ts` — they work correctly
- Do NOT add npm dependencies

---

## Architecture

```
rotate-property-code.ts (NEW — single-property orchestrator)
├── calls: generate-code.ts (existing — generates memorable code)
├── calls: update-door-code.ts (existing — updates Hostfully door_code)
└── calls: sifely-client.ts (existing — list/create/update/delete passcodes)
    └── FIX: createPasscode must produce type 2 (permanent) passcodes
```

The new tool is a **shell script orchestrator** — it calls the existing tools as child processes (via `tsx`), parses their JSON output, and handles errors. It does NOT import their functions directly.

The archetype instructions will be rewritten to call `rotate-property-code.ts` once per property (only for properties with checkout today), instead of implementing the rotation logic inline.

---

## Parallelization Map

```
Wave 1: T1 (sifely fix) — sequential, blocks T2
Wave 2: T2 (rotate-property-code.ts) — sequential, blocks T3
Wave 3: T3 (manual testing until it works) — sequential, blocks T4
Wave 4: T4 (archetype instructions rewrite) — sequential, blocks T5
Wave 5: T5 (Docker rebuild + E2E) — sequential, blocks F1-F3
FINAL:  F1, F2, F3 — parallel
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2      | 1    |
| 2    | 1          | 3      | 2    |
| 3    | 2          | 4      | 3    |
| 4    | 3          | 5      | 4    |
| 5    | 4          | F1-F3  | 5    |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick` (single function fix in sifely-client.ts)
- **Wave 2**: T2 → `deep` (new tool with error handling, retry logic, child process orchestration)
- **Wave 3**: T3 → Atlas does this directly (manual testing loop)
- **Wave 4**: T4 → `unspecified-high` (archetype instructions rewrite)
- **Wave 5**: T5 → `quick` (Docker rebuild + seed)
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`

---

## TODOs

- [x] 1. Fix `sifely-client.ts` `createPasscode` to reliably produce type 2 (permanent) passcodes

  **What to do**:
  - In the `createPasscode` function (line 326), add `keyboardPwdType: '2'` to the URLSearchParams. The TTLock API accepts this parameter to explicitly set the passcode type, rather than relying on inference from `startDate`/`endDate`.
  - Keep `startDate: Date.now(), endDate: 0` as-is (this is correct per TTLock docs for permanent codes).
  - Also add `keyboardPwdType: '2'` to the CLI `create-passcode` action's call to `createPasscode()` — the function signature needs a new optional `keyboardPwdType` parameter.
  - Verify: run `create-passcode` on lock 24572672, then `list-passcodes` and confirm the new passcode has `keyboardPwdType: 2`.

  **Acceptance Criteria**:
  - `sifely-client.ts --action create-passcode --lock-id 24572672 --name "test-permanent" --code "5665"` creates a passcode
  - `sifely-client.ts --action list-passcodes --lock-id 24572672` shows the new passcode with `keyboardPwdType: 2`
  - Clean up: delete the test passcode after verification

  **Must NOT do**:
  - Do not change the `updatePasscode` or `deletePasscode` functions
  - Do not change the CLI interface (flags, help text) beyond what's needed
  - Do not modify `generate-code.ts` or `update-door-code.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `src/worker-tools/locks/sifely-client.ts` lines 316-363 — `createPasscode` function
  - `src/worker-tools/locks/sifely-client.ts` lines 577-621 — CLI `create-passcode` action
  - TTLock API: `/v3/keyboardPwd/add` accepts `keyboardPwdType` as explicit parameter
  - vlre-hub `sifely.adapter.ts` line 323: sends `keyboardPwdType: String(params.keyboardPwdType)` explicitly

- [x] 2. Create `rotate-property-code.ts` — single-property rotation tool

  **What to do**:
  Create `src/worker-tools/locks/rotate-property-code.ts` — a shell tool that rotates lock codes for a SINGLE property. It orchestrates the existing tools via child processes.

  **CLI Interface**:

  ```
  tsx rotate-property-code.ts --property-id <hostfully-property-uid> [--help]
  ```

  **Environment variables required**:
  - `SUPABASE_URL` — PostgREST base URL
  - `SUPABASE_SECRET_KEY` — PostgREST auth key
  - `TENANT_ID` — tenant UUID
  - `SIFELY_USERNAME`, `SIFELY_PASSWORD` — Sifely credentials
  - `HOSTFULLY_API_KEY` — Hostfully API key

  **Algorithm** (step by step):
  1. Parse args, validate `--property-id` is provided
  2. Query PostgREST: `GET $SUPABASE_URL/rest/v1/property_locks?tenant_id=eq.$TENANT_ID&property_external_id=eq.$PROPERTY_ID&select=*`
  3. If no rows returned → output `{"success":false,"error":"No locks found for property","propertyId":"..."}` and exit 0
  4. Derive expected passcode name from first row's `passcode_name` (if set) or from `property_type` + `property_name`:
     - `passcode_name` field set → use it directly
     - `property_type === "home"` → `"permanent-visitor-home"`
     - `property_type === "room"` → parse last segment of `property_name` as integer N → `"permanent-visitor-room-N"` (fallback: `"permanent-visitor-room"`)
     - `property_type === "bundle" || "multi_home"` → `"permanent-visitor-bundle"`
     - fallback: `"permanent-visitor-{property_type}"`
  5. Collect all current passcode codes from all locks (for `--exclude-codes`):
     - For each unique `lock_external_id`: run `tsx sifely-client.ts --action list-passcodes --lock-id <id>`
     - Parse JSON output, extract all `keyboardPwd` values
     - On error: capture stderr, include in result, continue
  6. Generate new code: run `tsx generate-code.ts --exclude-codes "<comma-joined-codes>"`
     - Parse JSON output, extract `code` field
     - On error: output failure JSON and exit 1
  7. Update Hostfully door_code FIRST: run `tsx update-door-code.ts --property-id <id> --code <new-code>`
     - On exit code 2 (field not found): log warning, continue (non-blocking — some properties may not have the custom field)
     - On exit code 1 (API error): log error, continue (non-blocking)
     - On success: record `hostfullyUpdated: true`
  8. For each lock: rotate the passcode
     - List passcodes: `tsx sifely-client.ts --action list-passcodes --lock-id <id>`
     - Find matching passcode: case-insensitive name match on expected passcode name, `keyboardPwdType === 2` (permanent) only
     - If matching passcode found → UPDATE in-place: `tsx sifely-client.ts --action update-passcode --lock-id <id> --passcode-id <pwdId> --code <new-code>`
     - If NO matching passcode found → CREATE: `tsx sifely-client.ts --action create-passcode --lock-id <id> --name <expected-name> --code <new-code>`
     - Verify: list passcodes again, confirm the code matches
     - On ANY Sifely error: capture the error message, mark this lock as failed, continue to next lock
  9. Output structured JSON result to stdout:
     ```json
     {
       "success": true|false,
       "propertyId": "...",
       "newCode": "1221",
       "expectedPasscodeName": "permanent-visitor-home",
       "hostfullyUpdated": true|false,
       "hostfullyError": null|"error message",
       "locks": [
         {"lockId": "24572672", "lockName": "...", "success": true, "action": "updated|created", "passcodeId": 12345},
         {"lockId": "99999", "lockName": "...", "success": false, "error": "Sifely error: gateway offline"}
       ]
     }
     ```
     `success` is `true` only if ALL locks succeeded. Partial success still outputs the result with per-lock details.

  **Error handling requirements**:
  - Every child process call must be wrapped in try/catch
  - Capture both stdout and stderr from child processes
  - Parse JSON output; if parsing fails, include raw output in error
  - Sifely API errors (gateway offline, lock memory full, auth failure) must be captured and reported in the output JSON — never swallowed
  - Non-zero exit from child process = capture stderr as error message
  - The tool itself exits 0 on partial success (some locks failed) — the JSON output indicates which locks failed
  - The tool exits 1 only on fatal errors (can't query PostgREST, can't generate code)

  **Child process execution pattern**:
  Use Node.js `child_process.execSync` or `execFileSync` with:
  - `encoding: 'utf-8'`
  - `env: { ...process.env }` (inherit all env vars)
  - `timeout: 30000` (30s per call)
  - Wrap in try/catch to capture exit code and stderr

  **Acceptance Criteria**:
  - Running against property `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` with lock `24572672` in `property_locks`:
    - Outputs valid JSON with `success`, `propertyId`, `newCode`, `locks[]`
    - Lock 24572672 shows the new code in `list-passcodes` after rotation
    - Hostfully door_code is updated (or warning logged if field missing)
  - Running against a non-existent property → outputs `{"success":false,"error":"No locks found..."}`
  - Running with invalid Sifely credentials → outputs JSON with per-lock error messages (not a crash)
  - Can be run multiple times in a row — each run generates a new code and updates successfully

  **Must NOT do**:
  - Do not import functions from other tools — call them as child processes only
  - Do not add npm dependencies
  - Do not modify existing tools
  - Do not process multiple properties — this tool handles exactly ONE property
  - Do not add retry logic inside this tool (the AI employee can retry by calling the tool again)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/worker-tools/locks/sifely-client.ts` — existing Sifely tool (child process target)
  - `src/worker-tools/locks/generate-code.ts` — existing code generator (child process target)
  - `src/worker-tools/locks/update-door-code.ts` — existing Hostfully updater (child process target)
  - `src/worker-tools/locks/hostfully-door-code.ts` — existing Hostfully reader (reference for shell tool pattern)
  - vlre-hub `code-rotation.service.ts` lines 635-1033 — `rotateCodeForLock` reference implementation
  - Passcode name derivation: learnings.md "Domain Model" section

- [x] 3. Manual testing loop — test `rotate-property-code.ts` until it works

  **What to do**:
  Atlas (orchestrator) runs the tool directly against the test property and verifies results. This is NOT delegated — Atlas does it hands-on.

  **Test sequence**:
  1. Capture before-state: `sifely-client.ts --action list-passcodes --lock-id 24572672`
  2. Run: `SUPABASE_URL=http://localhost:54331 SUPABASE_SECRET_KEY=<key> TENANT_ID=00000000-0000-0000-0000-000000000003 SIFELY_USERNAME=admin@vlrealestate.co SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58 HOSTFULLY_API_KEY=Y6EQ7KgSwoOGCokD pnpm exec tsx src/worker-tools/locks/rotate-property-code.ts --property-id c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
  3. Verify JSON output is valid and `success: true`
  4. Capture after-state: `sifely-client.ts --action list-passcodes --lock-id 24572672`
  5. Compare: passcode code changed, name matches expected
  6. Check Hostfully: `update-door-code.ts --property-id c960c8d2 --code CHECK_ONLY` (or read custom data directly)
  7. Run again — verify a DIFFERENT new code is generated (not the same as last run)
  8. Test error case: run with invalid `SIFELY_PASSWORD` — verify JSON error output (not crash)
  9. Test error case: run with non-existent property ID — verify JSON error output

  **If any test fails**: delegate fix to subagent, then re-test. Repeat until ALL tests pass.

  **Acceptance Criteria**:
  - Tool runs successfully at least 2 times in a row with different codes each time
  - Error cases produce structured JSON (not crashes or stack traces)
  - Lock 24572672 has the correct new code after each run

  **Recommended Agent Profile**:
  - Atlas does this directly (not delegated)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

- [x] 4. Rewrite archetype instructions to use `rotate-property-code.ts`

  **What to do**:
  Update the code-rotation archetype instructions in `prisma/seed.ts` to:
  1. Query Hostfully for properties with checkout today (not all properties)
  2. Call `rotate-property-code.ts` once per property
  3. Collect results and post Slack summary

  **New instruction flow**:

  ```
  STEP 1: Determine which properties need rotation today.
    - Get today's date in YYYY-MM-DD format
    - Query PostgREST for all unique property_external_id values from property_locks
    - For each property: call Hostfully leads API to check if any lead has checkout today
    - Build list of properties that need rotation

  STEP 2: For each property needing rotation, call the rotation tool:
    tsx /tools/locks/rotate-property-code.ts --property-id <property_external_id>
    - Parse the JSON output
    - Record success/failure per property

  STEP 3: Post Slack summary with results.
  STEP 4: Write /tmp/summary.txt with full results JSON.
  ```

  **Acceptance Criteria**:
  - Archetype instructions in `prisma/seed.ts` are updated
  - Instructions reference `rotate-property-code.ts` (not inline rotation logic)
  - Instructions include checkout-date filtering via Hostfully leads API
  - `pnpm lint` passes

  **Must NOT do**:
  - Do not change the archetype's `system_prompt`, `model`, `risk_model`, or other config
  - Do not modify any file other than `prisma/seed.ts`
  - Do not add new Inngest functions or DB tables

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `prisma/seed.ts` — current archetype instructions (search for `00000000-0000-0000-0000-000000000016`)
  - Hostfully leads API: `GET /api/v3.2/leads?propertyUid=<uid>&checkOutDate=<YYYY-MM-DD>` (filter by checkout date)
  - vlre-hub `checkout.service.ts` — reference for checkout-date filtering logic

- [x] 5. Docker rebuild + seed + AGENTS.md update

  **What to do**:
  - Add `COPY src/worker-tools/locks/rotate-property-code.ts /tools/locks/rotate-property-code.ts` to Dockerfile
  - Run `docker build -t ai-employee-worker:latest .`
  - Run `pnpm exec prisma db seed` to update archetype instructions
  - Update AGENTS.md: add `rotate-property-code.ts` to the lock tools section
  - Verify: `docker run --rm ai-employee-worker:latest ls /tools/locks/` shows the new file

  **Acceptance Criteria**:
  - Docker image builds successfully
  - New tool is at `/tools/locks/rotate-property-code.ts` inside the image
  - Archetype instructions are updated in DB
  - AGENTS.md documents the new tool

  **Must NOT do**:
  - Do not modify any source files other than `Dockerfile` and `AGENTS.md`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: F1-F3
  - **Blocked By**: Task 4

- [x] 6. Notify completion — Send Telegram notification: plan `code-rotation-fix` complete.

---

## Final Verification Wave

> 3 review agents run in PARALLEL. ALL must APPROVE.

- [x] F1. **Code Quality Review** — `oracle`
      Read all changed/new files. Verify: no stubs, no TODOs, error handling is complete, JSON output contract is correct, child process calls are properly wrapped. Check that `sifely-client.ts` fix actually sends `keyboardPwdType: '2'`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Build + Test Verification** — `unspecified-high`
      Run `pnpm lint`, `pnpm build`, `pnpm test -- --run`. All must pass. Check for new TypeScript errors via `lsp_diagnostics`.
      Output: `Lint [PASS/FAIL] | Build [PASS/FAIL] | Tests [N pass, N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Trigger code-rotation via admin API. Verify: task reaches Done, lock 24572672 has a new code (different from before), Hostfully door_code updated, Slack notification posted. The employee should ONLY process properties with checkout today (not all 46+). If no properties have checkout today, the employee should complete quickly with "no properties need rotation" summary.
      Output: `Scenarios [N/N pass] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                          | Files                                            |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | `fix(locks): send keyboardPwdType in createPasscode for permanent type`                 | `src/worker-tools/locks/sifely-client.ts`        |
| 2    | `feat(locks): add single-property code rotation tool`                                   | `src/worker-tools/locks/rotate-property-code.ts` |
| 3    | — (no commit, testing step)                                                             | —                                                |
| 4    | `fix(archetype): rewrite code-rotation to use per-property tool and checkout filtering` | `prisma/seed.ts`                                 |
| 5    | `chore: add rotate-property-code to Docker image and docs`                              | `Dockerfile`, `AGENTS.md`                        |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # All tests pass
pnpm build                  # Clean compile
pnpm lint                   # No errors
docker build -t ai-employee-worker:latest .  # Successful build
```

### Final Checklist

- [ ] `rotate-property-code.ts` rotates codes for a single property end-to-end
- [ ] `sifely-client.ts` creates permanent (type 2) passcodes reliably
- [ ] Archetype instructions only process properties with checkout today
- [ ] Error handling: Sifely errors are captured and reported in JSON output
- [ ] Tool can be run multiple times safely (idempotent)
- [ ] Lock 24572672 is the only lock touched during testing
- [ ] All "Must NOT Have" items confirmed absent
