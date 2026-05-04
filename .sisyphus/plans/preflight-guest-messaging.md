# Preflight Guest Messaging Script

## TL;DR

> **Quick Summary**: Build a single TypeScript diagnostic script (`scripts/preflight-guest-messaging.ts`) that checks every prerequisite for the guest-messaging test suite and auto-fixes what it can.
>
> **Deliverables**:
>
> - `scripts/preflight-guest-messaging.ts` — standalone preflight checker (12 checks, auto-fix capable)
> - Updated `docs/testing/guest-messaging/2026-05-03-1946-00-prerequisites-and-setup.md` — references the script
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — 2 sequential tasks + final verification
> **Critical Path**: Task 1 → Task 2 → F1–F4

---

## Context

### Original Request

User asked to convert the 13-step manual prerequisites checklist from the guest-messaging testing guide into an automated script that reports pass/fail for each check and auto-fixes issues where possible.

### Interview Summary

**Key Discussions**:

- **Auto-fix behavior**: Report + Auto-fix — print ✅/❌ for each check, auto-fix fixable issues (e.g., store Hostfully API key as tenant secret from .env)
- **Scope**: Guest-messaging specific, not a general preflight
- **pnpm entry**: No — run directly via `npx tsx scripts/preflight-guest-messaging.ts`
- **No unit tests**: The script IS the verification tool

### Research Findings

**Script conventions** (from `scripts/setup.ts`, `verify-e2e.ts`, `trigger-task.ts`):

- No `dotenv` package — manual `.env` parsing via `readFileSync` + regex
- Color helpers: `C = { green, red, yellow, cyan, blue, reset, bold, dim }`
- Output helpers: `ok()`, `fail()`, `warn()`, `section()`
- HTTP: native `fetch()` only (no axios, no node-fetch)
- Shell: `zx` `$` for subprocess commands (Docker, cloudflared)
- Exit: `process.exit(FAIL > 0 ? 1 : 0)`
- Entry: `main().catch()` pattern or top-level await

**API contracts** (from source code):

- `GET /admin/tenants/:id/secrets` → `{ secrets: SecretMeta[] }` where `SecretMeta = { key, is_set, updated_at }`
- `PUT /admin/tenants/:id/secrets/:key` → body `{ "value": "..." }` → returns `SecretMeta`
- Hostfully list webhooks: `GET https://api.hostfully.com/api/v3.2/webhooks?agencyUid={uid}` with `X-HOSTFULLY-APIKEY` header → `{ webhooks: [...] }` (may be absent, use `?? []`)
- PostgREST tenant_integrations: `GET /rest/v1/tenant_integrations?tenant_id=eq.{id}&provider=eq.slack&deleted_at=is.null&select=id`

### Metis Review

**Identified Gaps** (addressed):

- `GET /admin/tenants/:id/secrets` returns `{ secrets: [...] }` not a flat array — script must parse `.secrets` property
- Smoke test webhook (check 12) creates a real task — script should warn the user or use a unique `message_uid` with a `preflight-` prefix so it's identifiable
- Hostfully webhook list may return `webhooks` field absent — use `?? []` fallback
- PostgREST soft-delete: must add `&deleted_at=is.null` to tenant_integrations query

---

## Work Objectives

### Core Objective

Create a self-contained diagnostic script that validates all 12 guest-messaging prerequisites and auto-fixes what it can, printing a clear pass/fail summary.

### Concrete Deliverables

- `scripts/preflight-guest-messaging.ts` — 12-check preflight script
- Updated prerequisites doc with script reference

### Definition of Done

- [ ] `npx tsx scripts/preflight-guest-messaging.ts` runs all 12 checks when stack is up
- [ ] Each check prints ✅ (pass), ❌ (fail), or 🔧 (auto-fixed) with a descriptive label
- [ ] Auto-fixable checks (tenant secret, webhook registration) attempt the fix and report result
- [ ] Script exits 0 on all-pass, 1 on any failure
- [ ] Summary at end shows total passed/failed/auto-fixed

### Must Have

- All 12 checks from the prerequisites doc implemented
- Auto-fix for: Hostfully API key as tenant secret, Hostfully webhook registration
- Follows existing script conventions (no dotenv, zx, ANSI colors, native fetch)
- Descriptive failure messages with actionable next steps (e.g., "Run OAuth: http://localhost:7700/slack/install?tenant=...")
- Box-drawing header/footer matching `verify-e2e.ts` style

### Must NOT Have (Guardrails)

- No `dotenv` package import — parse `.env` manually like other scripts
- No axios or node-fetch — native `fetch()` only
- No unit test file — the script is its own test
- No pnpm script entry in `package.json`
- No interactive prompts — fully non-interactive (auto-fix silently, report what was done)
- No modification to any source code files (only `scripts/` and `docs/testing/`)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None — the script IS the diagnostic tool
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI tool**: Use Bash — run the script, parse output, assert pass/fail counts

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Create preflight script [unspecified-high]

Wave 2 (After Wave 1):
└── Task 2: Update prerequisites doc to reference the script [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → F1-F4 → user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks   | Wave  |
| ----- | ---------- | -------- | ----- |
| 1     | —          | 2, F1-F4 | 1     |
| 2     | 1          | F1-F4    | 2     |
| F1-F4 | 1, 2       | —        | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `unspecified-high`
- **Wave 2**: 1 task — T2 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create preflight script — `scripts/preflight-guest-messaging.ts`

  **What to do**:

  Create a single self-contained TypeScript script that runs 12 sequential checks and prints a pass/fail summary. Follow the exact conventions from existing scripts.

  **Structure** (follow `verify-e2e.ts` + `trigger-task.ts` patterns):

  ```
  #!/usr/bin/env tsx
  imports: zx ($), node:fs (existsSync, readFileSync), node:path (resolve)
  $.verbose = false

  Color helpers: C = { green, red, yellow, cyan, blue, reset, bold, dim }
  Output helpers: ok(), fail(), warn(), section(), fixed() — "fixed" for auto-fix actions
  Env loading: manual .env parse (Pattern A from trigger-task.ts — returns Record<string,string>)
  Pass/fail counters: PASS, FAIL, FIXED

  Box-drawing header
  Run all 12 checks sequentially
  Box-drawing summary footer (PASS/FAIL/FIXED counts)
  process.exit(FAIL > 0 ? 1 : 0)
  ```

  **The 12 checks (implement in this order)**:
  1. **Env vars present**: Check these 13 vars are non-empty in `.env`: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `ADMIN_API_KEY`, `ENCRYPTION_KEY`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`, `OPENROUTER_API_KEY`, `HOSTFULLY_API_KEY`, `HOSTFULLY_AGENCY_UID`, `WEBHOOK_PUBLIC_URL`. Print each as sub-check (✓ or ✗). Count total missing. If any missing → FAIL with list.

  2. **Docker running**: `docker info --format '{{.ServerVersion}}'` via `zx` `$`. If exit code 0 → PASS. Else → FAIL ("Start Docker Desktop").

  3. **`cloudflared` on PATH**: `which cloudflared` via `zx` `$`. If found → PASS (print version). Else → FAIL ("Install: brew install cloudflared").

  4. **Tunnel config exists**: `existsSync(resolve(homedir(), '.cloudflared/ai-employee-local.yml'))`. If exists → PASS. Else → FAIL ("See docs/2026-05-02-1934-cloudflare-tunnel-and-hostfully-webhook-setup.md").

  5. **Gateway health**: `fetch('http://localhost:7700/health')` → expect JSON `{ status: 'ok' }`. If OK → PASS. If network error → FAIL ("Start the stack: pnpm dev:local"). Wrap in try/catch.

  6. **Tunnel reachable**: `fetch('https://local-ai-employee.dozaldevs.com/health')` → expect JSON `{ status: 'ok' }`. If OK → PASS. Else → FAIL ("Tunnel not connected — check cloudflared logs").

  7. **VLRE tenant in DB**: `fetch('http://localhost:54321/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000003&select=id,name,slug', { headers: { apikey: SUPABASE_SECRET_KEY, Authorization: 'Bearer ' + SUPABASE_SECRET_KEY } })`. Expect array with 1 element. If found → PASS (print name). Else → FAIL ("Run: pnpm prisma migrate deploy && pnpm prisma db seed").

  8. **Guest-messaging archetype in DB**: Same PostgREST pattern → `archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=id,role_name,slug`. Expect 1 result. If found → PASS (print role_name). Else → FAIL.

  9. **Hostfully API key as tenant secret**: `fetch('http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets', { headers: { 'X-Admin-Key': ADMIN_API_KEY } })` → parse response as `{ secrets: SecretMeta[] }` → check if `secrets` array contains an entry with `key === 'hostfully_api_key'`. **Auto-fix**: If missing AND `HOSTFULLY_API_KEY` is set in .env, call `PUT /admin/tenants/.../secrets/hostfully_api_key` with `{ "value": envValue }` → report FIXED. If missing and no env value → FAIL.

  10. **Slack OAuth connected**: PostgREST query → `tenant_integrations?tenant_id=eq.00000000-0000-0000-0000-000000000003&provider=eq.slack&deleted_at=is.null&select=id,external_id`. If row exists → PASS (print external_id). Else → FAIL ("Run OAuth: http://localhost:7700/slack/install?tenant=00000000-0000-0000-0000-000000000003").

  11. **Hostfully webhook registered**: `fetch('https://api.hostfully.com/api/v3.2/webhooks?agencyUid=' + HOSTFULLY_AGENCY_UID, { headers: { 'X-HOSTFULLY-APIKEY': HOSTFULLY_API_KEY, 'Content-Type': 'application/json' } })` → parse response, get `webhooks ?? []` → find entry where `eventType === 'NEW_INBOX_MESSAGE'` AND `callbackUrl === WEBHOOK_PUBLIC_URL + '/webhooks/hostfully'`. **Auto-fix**: If not found, call `POST https://api.hostfully.com/api/v3.2/webhooks` with `{ agencyUid, eventType: 'NEW_INBOX_MESSAGE', callbackUrl: url + '/webhooks/hostfully', webhookType: 'POST_JSON', objectUid: agencyUid }` → report FIXED. If wrong URL → WARN ("Webhook exists but points to different URL: ..."). If API call fails → FAIL.

  12. **Webhook receiver smoke test**: `fetch('http://localhost:7700/webhooks/hostfully', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578', event_type: 'NEW_INBOX_MESSAGE', message_uid: 'preflight-' + Date.now(), thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa', lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb', property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2', message: 'Preflight smoke test — please ignore' }) })` → expect `{ ok: true, task_id: '...' }`. If OK → PASS (print task_id). Print a WARN: "This created a real task. Cancel it in Inngest if needed: http://localhost:8288". Else → FAIL.

  **Must NOT do**:
  - Do NOT import `dotenv`
  - Do NOT use axios or node-fetch
  - Do NOT add interactive prompts (no readline, no inquirer)
  - Do NOT import from `src/lib/` — keep script self-contained
  - Do NOT add a pnpm script entry in package.json

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Single-file script with moderate complexity (12 checks, 2 auto-fixes, API contracts). Not visual, not ultra-complex — standard competent implementation.
  - **Skills**: `[]`
    - No special skills needed — standard TypeScript, no UI, no browser, no git

  **Parallelization**:
  - **Can Run In Parallel**: NO (only task in Wave 1)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2, F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `scripts/trigger-task.ts` — Most complete script: `loadEnv()` pattern, `C` color helpers, `ok`/`fail`/`warn`/`section` helpers, `main().catch()` entry, native `fetch()` with error handling. **Copy the loadEnv function, color helpers, and output helpers verbatim.**
  - `scripts/verify-e2e.ts` — Box-drawing header/footer, `PASS`/`FAIL` counter pattern, `process.exit(FAIL > 0 ? 1 : 0)`. **Copy the header/footer style.**
  - `scripts/setup.ts` — Section-by-section structure with `section()` dividers, `hasErrors` tracking. **Follow the sequential check-by-check structure.**

  **API/Type References** (contracts to implement against):
  - `src/gateway/routes/admin-tenant-secrets.ts` — `GET /admin/tenants/:id/secrets` returns `{ secrets: SecretMeta[] }` where `SecretMeta = { key: string, is_set: boolean, updated_at: string }`. `PUT /admin/tenants/:id/secrets/:key` accepts `{ value: string }`, returns `SecretMeta`.
  - `src/worker-tools/hostfully/register-webhook.ts` — Hostfully API `GET /webhooks?agencyUid=...` returns `{ webhooks: [...] }` (may be absent, use `?? []`). `POST /webhooks` body: `{ agencyUid, eventType, callbackUrl, webhookType, objectUid }`.
  - `src/gateway/routes/hostfully.ts` — webhook receiver accepts POST with `{ agency_uid, event_type, message_uid, thread_uid, lead_uid, property_uid, message }`, returns `{ ok: true, task_id }` or `{ ok: true, duplicate: true }`.

  **PostgREST patterns**:
  - `scripts/dev-e2e.ts:455` — PostgREST query for `tenant_integrations`, includes `deleted_at=is.null` filter
  - All PostgREST queries use `apikey` + `Authorization: Bearer` headers with `SUPABASE_SECRET_KEY`
  - Base URL: `http://localhost:54321/rest/v1/`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script runs all 12 checks with stack up
    Tool: Bash
    Preconditions: pnpm dev:local running, all prerequisites satisfied
    Steps:
      1. Run: npx tsx scripts/preflight-guest-messaging.ts
      2. Capture stdout
      3. Assert output contains 12 check results (each with ✓, ✗, or 🔧)
      4. Assert output ends with summary box showing "ALL N CHECKS PASSED" or "N/M passed"
      5. Assert exit code is 0
    Expected Result: 12 checks printed, summary shows all passed, exit 0
    Failure Indicators: Any ✗ in output, exit code 1, script crashes
    Evidence: .sisyphus/evidence/task-1-all-checks-pass.txt

  Scenario: Script reports failure when gateway is down
    Tool: Bash
    Preconditions: Gateway NOT running (no pnpm dev:local)
    Steps:
      1. Run: npx tsx scripts/preflight-guest-messaging.ts
      2. Assert check 5 (Gateway health) shows ✗
      3. Assert exit code is 1
      4. Assert summary shows at least 1 failure
    Expected Result: Check 5 fails with actionable message, exit code 1
    Failure Indicators: Script crashes with unhandled error, or check 5 shows ✓ when gateway is down
    Evidence: .sisyphus/evidence/task-1-gateway-down.txt

  Scenario: Auto-fix stores tenant secret when missing
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY set in .env, but NOT stored as tenant secret (delete it first via Admin API)
    Steps:
      1. Delete the secret: curl -X DELETE http://localhost:7700/admin/tenants/.../secrets/hostfully_api_key
      2. Run: npx tsx scripts/preflight-guest-messaging.ts
      3. Assert check 9 shows 🔧 (auto-fixed)
      4. Verify secret now exists: curl GET /admin/tenants/.../secrets
    Expected Result: Secret auto-stored, check shows fixed
    Evidence: .sisyphus/evidence/task-1-autofix-secret.txt
  ```

  **Commit**: YES
  - Message: `feat(scripts): add guest-messaging preflight checker`
  - Files: `scripts/preflight-guest-messaging.ts`
  - Pre-commit: `npx tsx scripts/preflight-guest-messaging.ts` (syntax validation — may fail checks if stack not up, that's OK as long as script doesn't crash)

- [x] 2. Update prerequisites doc to reference the script

  **What to do**:

  Edit `docs/testing/guest-messaging/2026-05-03-1946-00-prerequisites-and-setup.md` to add a section at the top (after the Quick Reference table) that tells the user about the automated script.

  Add this section:

  ````markdown
  ---

  ## Automated Preflight Script

  Instead of running each step manually, use the preflight script to check everything at once:

  ```bash
  npx tsx scripts/preflight-guest-messaging.ts
  ```
  ````

  The script checks all 13 prerequisites below, reports ✅/❌ for each, and auto-fixes what it can (e.g., storing the Hostfully API key as a tenant secret, registering the webhook). If all checks pass, you're ready to test.

  > **Note**: The smoke test (Step 13) creates a real task. Cancel it in the Inngest dashboard if you don't want it to run through the full lifecycle.

  If any checks fail, the script prints actionable next steps. You can also follow the manual steps below for detailed troubleshooting.

  ***

  ```

  **Must NOT do**:
  - Do NOT remove or rewrite any existing manual steps — they remain as the detailed fallback
  - Do NOT change the Quick Reference table

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single small edit to an existing markdown file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `docs/testing/guest-messaging/2026-05-03-1946-00-prerequisites-and-setup.md` — the file to edit, insert new section after the Quick Reference table and before Step 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```

  Scenario: Doc has script reference
  Tool: Bash (grep)
  Preconditions: Task 2 complete
  Steps: 1. Read the file 2. Assert it contains "npx tsx scripts/preflight-guest-messaging.ts" 3. Assert it contains "Automated Preflight Script" heading 4. Assert all 13 original manual steps still exist (Step 1 through Step 13)
  Expected Result: Script reference added, no manual steps removed
  Evidence: .sisyphus/evidence/task-2-doc-updated.txt

  ```

  **Commit**: YES
  - Message: `docs(testing): reference preflight script in prerequisites guide`
  - Files: `docs/testing/guest-messaging/2026-05-03-1946-00-prerequisites-and-setup.md`
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter. Review `scripts/preflight-guest-messaging.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod (acceptable here since it's a CLI tool), commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `npx tsx scripts/preflight-guest-messaging.ts` with the stack running. Verify: each check prints a result, auto-fix checks attempt fixes, summary is printed, exit code is correct. Save terminal output to `.sisyphus/evidence/final-qa/`.
      Output: `Checks [N/N rendered] | Auto-fix [N tested] | Exit Code [correct/wrong] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                      | Files                                                                        | Pre-commit                                                                   |
| ------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1      | `feat(scripts): add guest-messaging preflight checker`       | `scripts/preflight-guest-messaging.ts`                                       | `npx tsx scripts/preflight-guest-messaging.ts --help` (or just syntax check) |
| 2      | `docs(testing): reference preflight script in prerequisites` | `docs/testing/guest-messaging/2026-05-03-1946-00-prerequisites-and-setup.md` | —                                                                            |

---

## Success Criteria

### Verification Commands

```bash
npx tsx scripts/preflight-guest-messaging.ts  # Expected: 12 checks, summary, exit 0 (when stack is up and configured)
```

### Final Checklist

- [ ] All 12 checks implemented and print results
- [ ] Auto-fix for tenant secret and webhook registration works
- [ ] Follows script conventions (no dotenv, zx, ANSI colors, native fetch)
- [ ] No interactive prompts
- [ ] Prerequisites doc updated to reference the script
- [ ] All tests pass (`pnpm test -- --run`)
