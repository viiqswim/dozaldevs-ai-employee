# Upgrade list-access-records.ts — Pagination, Full Fields, Human Labels

## TL;DR

> **Quick Summary**: Upgrade the Sifely `list-access-records.ts` tool to auto-paginate all results, preserve all API fields (currently stripped), add human-readable record type labels via `--human` flag, and default date ranges to last 7 days. Also fix the HTTP method from GET to POST to match the real API.
>
> **Deliverables**:
>
> - Updated `src/worker-tools/sifely/lib/api.ts` with new types and assertion function
> - Rewritten `src/worker-tools/sifely/list-access-records.ts` with all improvements
> - Updated AGENTS.md CLI docs
> - Live-tested against test lock 24572672
>
> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (types) → T2 (rewrite tool) → T3 (AGENTS.md) → T4 (live test) → F1-F4

---

## Context

### Original Request

User asked to upgrade `list-access-records.ts` after discovering it only fetches page 1, strips critical fields (`recordTypeFromLock`, `username`, `hotelUsername`, `keyName`), requires mandatory epoch dates, and uses GET instead of the real API's POST method.

### Interview Summary

**Key Discussions**:

- User provided multiple curl examples showing the real `/v3/lockRecord/list` endpoint uses POST with form-encoded body
- Record types mapped: 20=Fingerprint, 47=Auto-Lock, 28=Gateway/Remote, 4=Passcode, 13=Failed Attempt
- No unit tests — user explicitly said to skip (pre-existing failures unrelated)
- Import convention: `./lib/api.js` (ESM TypeScript, 234 matches, 0 `.ts` imports)

**Research Findings**:

- `assertListSuccess` (line 174-178 of api.ts) throws when `code` is defined — but the access records endpoint ALWAYS returns `{code: 200, data: {list: [...]}}` on success. This means the current tool likely throws on success for this endpoint. Different from passcode endpoints which return `{list: [...]}` with no `code` on success.
- `SifelyListResponse<T>` models `list` at top level, but access records nest under `data: { total, pages, list }` — a completely different envelope.

### Metis Review

**Identified Gaps** (addressed):

- **assertListSuccess blast radius**: Must NOT modify existing function — create new `assertPaginatedListSuccess` for the different envelope. Passcode tools rely on the current behavior.
- **SifelyListResponse<T> blast radius**: Must NOT modify existing type — create new `SifelyPaginatedResponse<T>`. Used by list-passcodes, create-passcode, diagnose-access.
- **Pagination safety cap**: Add internal 100-page cap with stderr warning to prevent infinite loops on API bugs.
- **`date` timestamp freshness**: Must rebuild `date: String(Date.now())` on every page fetch, not just on retry — stale timestamps cause 500s.
- **`diagnose-access.ts` has same bug**: Explicitly OUT of scope. Has identical issues (GET, wrong envelope, no pagination) but user only asked about `list-access-records.ts`.
- **`--human` output shape**: Must be additive — adds `recordTypeLabel` field alongside existing numeric fields. Does NOT change shape when `--human` is absent.
- **Empty pagination handling**: Must handle `pages === 0` gracefully (empty result, skip fetch loop).

---

## Work Objectives

### Core Objective

Make `list-access-records.ts` a production-grade tool that fetches ALL access records (auto-paginated), preserves ALL fields from the API, supports optional human-readable labels, and works without mandatory date arguments.

### Concrete Deliverables

- `src/worker-tools/sifely/lib/api.ts` — new interfaces + assertion function (additive only)
- `src/worker-tools/sifely/list-access-records.ts` — full rewrite with all improvements
- `AGENTS.md` — updated CLI docs for the tool

### Definition of Done

- [ ] `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672` exits 0 (date defaults work)
- [ ] Output contains `recordTypeFromLock`, `username` fields (not stripped)
- [ ] `--human` flag adds `recordTypeLabel` field
- [ ] `tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672` exits 0 (regression check)
- [ ] `pnpm build` exits 0
- [ ] `pnpm lint` exits 0

### Must Have

- Auto-pagination: fetch all pages, merge into flat array output
- All API fields preserved in output (no stripping)
- `--human` flag for record type labels
- Optional `--start-date` / `--end-date` with 7-day default
- POST with form-encoded body (not GET with query params)
- New `SifelyPaginatedResponse<T>` type (do NOT modify `SifelyListResponse<T>`)
- New `assertPaginatedListSuccess` function (do NOT modify `assertListSuccess`)
- Internal pagination cap of 100 pages with stderr warning

### Must NOT Have (Guardrails)

- Do NOT modify `assertListSuccess` — correct for passcode endpoints
- Do NOT modify `SifelyListResponse<T>` — used by passcode and lock tools
- Do NOT touch `diagnose-access.ts` — same bug but out of scope
- Do NOT add `--page-size`, `--max-pages`, `--output-format` flags — not in spec
- Do NOT change output shape when `--human` is absent — backward-compatible
- Do NOT add unit tests — user explicitly said skip

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (user explicitly said skip)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios. Live API tests against test lock 24572672 ONLY.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — Run command, parse output, assert fields and exit codes

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — additive types + tool rewrite):
├── Task 1: Add new types + assertion to lib/api.ts [quick]
├── Task 2: Rewrite list-access-records.ts [unspecified-high]
└── (T2 depends on T1)

Wave 2 (After Wave 1 — docs + live test):
├── Task 3: Update AGENTS.md CLI docs [quick]
├── Task 4: Live API test against lock 24572672 + regression check [quick]
└── (T3 and T4 are parallel, both depend on T2)

Wave 3 (After Wave 2 — commit + notify):
├── Task 5: Commit all changes [quick]
└── Task 6: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| T1    | —          | T2     | 1     |
| T2    | T1         | T3, T4 | 1     |
| T3    | T2         | T5     | 2     |
| T4    | T2         | T5     | 2     |
| T5    | T3, T4     | T6     | 3     |
| T6    | T5         | F1-F4  | 3     |
| F1-F4 | T6         | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `unspecified-high`
- **Wave 2**: 2 tasks — T3 → `quick`, T4 → `quick`
- **Wave 3**: 2 tasks — T5 → `quick`, T6 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add new types and assertion function to lib/api.ts (ADDITIVE ONLY)

  **What to do**:
  - Add `SifelyPaginatedResponse<T>` interface to model the access records envelope:
    ```typescript
    export interface SifelyPaginatedResponse<T> {
      code: number;
      msg?: string;
      data?: {
        total: number;
        pages: number;
        pageNo: number;
        pageSize: number;
        list: T[];
      };
    }
    ```
  - Add `assertPaginatedListSuccess` function:
    ```typescript
    export function assertPaginatedListSuccess<T>(
      body: SifelyPaginatedResponse<T>,
      operationName: string,
    ): void {
      if (body.code !== 200) {
        throw new Error(`Sifely ${operationName} error: ${body.msg ?? \`code ${body.code}\`}`);
      }
      if (!body.data) {
        throw new Error(`Sifely ${operationName} error: response missing data field`);
      }
    }
    ```
  - Expand `SifelyAccessRecordRaw` to include all fields from the real API:
    ```typescript
    export interface SifelyAccessRecordRaw {
      recordId: number;
      lockId: number;
      recordType: number;
      recordTypeFromLock: number;
      success: number;
      keyboardPwd: string;
      lockDate: number;
      serverDate: number;
      username: string;
      hotelUsername: string;
      keyName: string;
    }
    ```
  - Expand `AccessRecord` to include the new fields plus optional `recordTypeLabel`:
    ```typescript
    export interface AccessRecord {
      recordId: number;
      lockId: number;
      recordType: number;
      recordTypeFromLock: number;
      success: number;
      keyboardPwd: string;
      lockDate: number;
      serverDate: number;
      username: string;
      hotelUsername: string;
      keyName: string;
      recordTypeLabel?: string;
    }
    ```

  **Must NOT do**:
  - Do NOT modify `assertListSuccess` — it is correct for passcode endpoints
  - Do NOT modify `SifelyListResponse<T>` — used by other tools
  - Do NOT remove or rename any existing exports

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small additive changes to a single file — adding interfaces and one function
  - **Skills**: `[]`
    - No domain-specific skills needed for type definitions

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential — T2 depends on T1)
  - **Blocks**: T2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/worker-tools/sifely/lib/api.ts:30-36` — `SifelyListResponse<T>` — follow same pattern for new `SifelyPaginatedResponse<T>` but with `data` wrapper
  - `src/worker-tools/sifely/lib/api.ts:174-178` — `assertListSuccess` — follow same pattern for `assertPaginatedListSuccess` but check `body.code !== 200` instead of `body.code !== undefined`
  - `src/worker-tools/sifely/lib/api.ts:48-56` — Current `SifelyAccessRecordRaw` — expand in place with new fields
  - `src/worker-tools/sifely/lib/api.ts:12-20` — Current `AccessRecord` — expand in place with new fields

  **WHY Each Reference Matters**:
  - `SifelyListResponse<T>` shows the pattern for response types — new type follows same structure but wraps `list` under `data`
  - `assertListSuccess` shows the assertion pattern — new function checks `code !== 200` (not `code !== undefined`) because the paginated endpoint always includes `code`
  - The raw/record interfaces show what fields exist today — executor adds new fields in the same style

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compiles with new types
    Tool: Bash
    Preconditions: T1 changes applied to api.ts
    Steps:
      1. Run `pnpm build 2>&1 | grep -c "error TS"`
      2. Assert output is `0`
    Expected Result: Zero TypeScript errors — exits 0
    Failure Indicators: Any line containing "error TS" in build output
    Evidence: .sisyphus/evidence/task-1-build-check.txt

  Scenario: Existing exports unchanged (regression)
    Tool: Bash
    Preconditions: T1 changes applied
    Steps:
      1. Run `grep -c "export function assertListSuccess" src/worker-tools/sifely/lib/api.ts`
      2. Assert output is `1` (still exists, unchanged)
      3. Run `grep -c "export interface SifelyListResponse" src/worker-tools/sifely/lib/api.ts`
      4. Assert output is `1` (still exists, unchanged)
      5. Run `grep -c "export function assertPaginatedListSuccess" src/worker-tools/sifely/lib/api.ts`
      6. Assert output is `1` (new function added)
      7. Run `grep -c "export interface SifelyPaginatedResponse" src/worker-tools/sifely/lib/api.ts`
      8. Assert output is `1` (new type added)
    Expected Result: All 4 assertions pass — old exports preserved, new exports added
    Failure Indicators: Any count is 0 (missing) or the existing exports were modified
    Evidence: .sisyphus/evidence/task-1-regression-check.txt
  ```

  **Commit**: YES (groups with T2, T3 — single commit)
  - Message: `feat(sifely): upgrade list-access-records with pagination, full fields, and human labels`
  - Files: `src/worker-tools/sifely/lib/api.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Rewrite list-access-records.ts with pagination, full fields, human labels, optional dates

  **What to do**:
  - **CLI argument changes**:
    - `--lock-id <id>` — still required
    - `--start-date <ms>` — NOW OPTIONAL, defaults to `Date.now() - 7 * 24 * 60 * 60 * 1000`
    - `--end-date <ms>` — NOW OPTIONAL, defaults to `Date.now()`
    - `--human` — NEW FLAG, adds `recordTypeLabel` to each record
    - `--help` / `-h` — update help text to reflect optional dates and new flag
  - **HTTP method fix**: Change from GET with query params to POST with form-encoded body:
    ```typescript
    const response = await fetch(`${config.baseUrl}/v3/lockRecord/list`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    ```
  - **Auto-pagination**: Fetch page 1, read `data.pages` for total page count, then loop pages 2..N. Merge all `data.list` arrays into one flat output array. Internal cap: 100 pages with stderr warning.
    ```typescript
    const MAX_PAGES = 100;
    const PAGE_SIZE = 100; // maximize per-page to minimize requests
    // Page 1:
    const firstBody = await fetchPage(1);
    assertPaginatedListSuccess(firstBody, 'listAccessRecords');
    const totalPages = Math.min(firstBody.data!.pages, MAX_PAGES);
    const allRecords = [...(firstBody.data!.list ?? [])];
    // Pages 2..N:
    for (let page = 2; page <= totalPages; page++) {
      const pageBody = await fetchPage(page);
      assertPaginatedListSuccess(pageBody, 'listAccessRecords');
      allRecords.push(...(pageBody.data!.list ?? []));
    }
    if (firstBody.data!.pages > MAX_PAGES) {
      process.stderr.write(
        `Warning: ${firstBody.data!.pages} pages available, capped at ${MAX_PAGES}\n`,
      );
    }
    ```
  - **CRITICAL: `date` freshness**: The `date: String(Date.now())` parameter MUST be rebuilt on every page fetch call (inside the lambda), NOT cached from page 1. Sifely returns 500 on stale timestamps.
  - **Full field preservation**: Map ALL fields from `SifelyAccessRecordRaw` to `AccessRecord` — no stripping. Every field in the raw response goes into the output.
  - **`--human` label map** (use `recordTypeFromLock`, NOT `recordType`):
    ```typescript
    const RECORD_TYPE_LABELS: Record<number, string> = {
      4: 'Passcode',
      13: 'Failed Attempt',
      20: 'Fingerprint',
      28: 'Gateway/Remote',
      47: 'Auto-Lock',
    };
    // Fallback: `Unknown (${recordTypeFromLock})`
    ```
    When `--human` is passed, add `recordTypeLabel` field to each record. When not passed, omit it entirely.
  - **Handle empty results**: If `data.pages === 0` or `data.total === 0`, output empty array `[]` and exit 0.
  - **Wrap each page fetch in `withRetry`**: Each individual page request should be retryable (not the entire pagination loop).

  **Must NOT do**:
  - Do NOT add `--page-size`, `--max-pages`, `--output-format` flags
  - Do NOT use `assertListSuccess` — use the new `assertPaginatedListSuccess`
  - Do NOT use `SifelyListResponse` — use the new `SifelyPaginatedResponse`
  - Do NOT change the output format when `--human` is absent (backward compatible)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full rewrite of a 150-line tool with multiple concerns (HTTP method, pagination, field mapping, flag parsing). Needs careful attention to Sifely API quirks.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after T1)
  - **Blocks**: T3, T4
  - **Blocked By**: T1

  **References**:

  **Pattern References** (existing code to follow):
  - `src/worker-tools/sifely/list-access-records.ts` — The ENTIRE current file. This is being rewritten in-place. Understand the current structure, then replace.
  - `src/worker-tools/sifely/list-passcodes.ts` — CLI arg parsing pattern, help text format, `withRetry` usage, output to stdout pattern
  - `src/worker-tools/sifely/list-locks.ts` — Another tool in the same directory for reference on shared lib usage

  **API/Type References** (contracts to implement against):
  - `src/worker-tools/sifely/lib/api.ts` — All imports: `login`, `resolveConfig`, `withRetry`, `assertPaginatedListSuccess` (new from T1), `SifelyPaginatedResponse` (new from T1), `SifelyAccessRecordRaw`, `AccessRecord`
  - Import line: `import { login, resolveConfig, withRetry, assertPaginatedListSuccess } from './lib/api.js';`
  - Type import: `import type { AccessRecord, SifelyPaginatedResponse, SifelyAccessRecordRaw } from './lib/api.js';`

  **WHY Each Reference Matters**:
  - Current `list-access-records.ts` — need to preserve the shebang, help text structure, error message patterns, and overall file shape
  - `list-passcodes.ts` — gold standard for CLI arg parsing pattern in this codebase
  - `lib/api.ts` — the import source; executor needs to know exact function signatures and type shapes

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Default dates — no date flags required
    Tool: Bash
    Preconditions: SIFELY_USERNAME and SIFELY_PASSWORD set in env
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 2>/tmp/task2-stderr.txt`
      2. Capture exit code
      3. Parse stdout as JSON
    Expected Result: Exit code 0, valid JSON array output (may be empty if no records in 7 days)
    Failure Indicators: Exit code non-zero, stderr contains "Error", stdout is not valid JSON
    Evidence: .sisyphus/evidence/task-2-default-dates.txt

  Scenario: Explicit dates with known records
    Tool: Bash
    Preconditions: SIFELY credentials set
    Steps:
      1. Calculate 30 days ago in epoch ms: `node -e "console.log(Date.now() - 30*24*60*60*1000)"`
      2. Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 --start-date <30d-ago> --end-date <now>`
      3. Parse stdout as JSON, check array length > 0
    Expected Result: Exit code 0, JSON array with at least 1 record
    Failure Indicators: Empty array (lock 24572672 should have records in 30 days), non-zero exit
    Evidence: .sisyphus/evidence/task-2-explicit-dates.txt

  Scenario: All fields preserved (no stripping)
    Tool: Bash
    Preconditions: Records returned from previous scenario
    Steps:
      1. Run the tool and pipe to: `node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const r=d[0]; const need=['recordId','lockId','recordType','recordTypeFromLock','success','keyboardPwd','lockDate','serverDate','username']; const miss=need.filter(k=>!(k in r)); if(miss.length){console.error('Missing:',miss);process.exit(1)} console.log('Fields present:', Object.keys(r).join(', '))"`
      2. Assert exit 0
    Expected Result: All required fields present in output records
    Failure Indicators: "Missing:" message in stderr with list of absent fields
    Evidence: .sisyphus/evidence/task-2-field-check.txt

  Scenario: --human flag adds recordTypeLabel
    Tool: Bash
    Preconditions: Records available
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 --human`
      2. Pipe to: `node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); if(!d.length){console.log('No records');process.exit(0)} const r=d[0]; if(!('recordTypeLabel' in r)){console.error('Missing recordTypeLabel');process.exit(1)} console.log('Label:', r.recordTypeLabel)"`
    Expected Result: Exit 0, each record has `recordTypeLabel` field with human-readable string
    Failure Indicators: "Missing recordTypeLabel" in stderr
    Evidence: .sisyphus/evidence/task-2-human-flag.txt

  Scenario: Without --human flag, recordTypeLabel absent (backward compat)
    Tool: Bash
    Preconditions: Records available
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672` (NO --human)
      2. Pipe to: `node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); if(!d.length){process.exit(0)} if('recordTypeLabel' in d[0]){console.error('recordTypeLabel should NOT be present');process.exit(1)} console.log('Backward compatible')"`
    Expected Result: Exit 0, `recordTypeLabel` NOT present in output
    Failure Indicators: "recordTypeLabel should NOT be present" message
    Evidence: .sisyphus/evidence/task-2-no-human.txt

  Scenario: --help flag shows updated usage
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-access-records.ts --help 2>&1`
      2. Assert output contains "--human" and "(optional)" for date flags
    Expected Result: Help text mentions --human flag and shows dates as optional
    Failure Indicators: Help text missing --human or still says "(required)" for dates
    Evidence: .sisyphus/evidence/task-2-help-text.txt
  ```

  **Commit**: YES (groups with T1, T3 — single commit)
  - Message: `feat(sifely): upgrade list-access-records with pagination, full fields, and human labels`
  - Files: `src/worker-tools/sifely/list-access-records.ts`

- [x] 3. Update AGENTS.md CLI docs for list-access-records.ts

  **What to do**:
  - Find the existing `list-access-records.ts` CLI entry in AGENTS.md under the Sifely tools section
  - Update it to reflect:
    - `--start-date <ms>` is now optional (defaults to 7 days ago)
    - `--end-date <ms>` is now optional (defaults to now)
    - New flag: `--human` — adds human-readable `recordTypeLabel` to each record
    - Output now includes all fields: `recordTypeFromLock`, `username`, `hotelUsername`, `keyName`
    - Auto-paginates all results (no longer limited to 20)
  - Keep the same style and indentation as other tool entries in AGENTS.md

  **Must NOT do**:
  - Do NOT change any other tool's documentation
  - Do NOT add documentation for `diagnose-access.ts` changes (it's out of scope)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single documentation update in one file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T4)
  - **Blocks**: T5
  - **Blocked By**: T2

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Search for `list-access-records.ts` — the existing CLI entry is the exact text to update. Also look at nearby tool entries (e.g., `list-passcodes.ts`, `list-locks.ts`) for formatting style.

  **WHY Each Reference Matters**:
  - The existing entry shows the exact format and location to edit. Other tool entries show the consistent CLI doc style to match.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md updated correctly
    Tool: Bash
    Steps:
      1. Run `grep -A 5 "list-access-records" AGENTS.md`
      2. Assert output contains "--human"
      3. Assert output does NOT contain "(required)" for --start-date or --end-date
    Expected Result: CLI docs reflect new optional dates and --human flag
    Failure Indicators: Missing --human mention, dates still marked required
    Evidence: .sisyphus/evidence/task-3-agents-md-check.txt
  ```

  **Commit**: YES (groups with T1, T2 — single commit)
  - Message: `feat(sifely): upgrade list-access-records with pagination, full fields, and human labels`
  - Files: `AGENTS.md`

- [x] 4. Live API test against test lock 24572672 + regression check

  **What to do**:
  - Run the upgraded tool against the designated test lock to verify it works end-to-end with the real Sifely API
  - Run regression check on `list-passcodes.ts` to verify `assertListSuccess` still works for passcode endpoints
  - If 7-day default window returns 0 records, extend to 30 days with explicit dates
  - Capture all output as evidence

  **Must NOT do**:
  - Do NOT test against any lock other than 24572672
  - Do NOT make any code changes in this task — test only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands and capturing output — no code changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T3)
  - **Blocks**: T5
  - **Blocked By**: T2

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Test lock: `24572672` (5306-kin-Home Front PERSONAL), property `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
  - Environment: `SIFELY_USERNAME=admin@vlrealestate.co`, `SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58`

  **WHY Each Reference Matters**:
  - These are the ONLY credentials and lock IDs approved for testing. Using anything else is forbidden.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Live API — default dates
    Tool: Bash
    Preconditions: Sifely credentials in env
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672`
      2. Capture exit code and stdout
      3. If exit 0 and stdout is valid JSON array with length > 0: PASS
      4. If exit 0 but empty array: extend to 30 days with explicit dates and retest
    Expected Result: Exit 0, valid JSON array
    Failure Indicators: Non-zero exit, authentication error, HTTP error
    Evidence: .sisyphus/evidence/task-4-live-default.json

  Scenario: Live API — --human flag
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 --human`
      2. Parse output, verify `recordTypeLabel` present on first record
      3. Verify label is a known string (Passcode, Fingerprint, Gateway/Remote, Auto-Lock, Failed Attempt, or Unknown)
    Expected Result: Each record has a readable label
    Failure Indicators: Missing label field, or label is empty/undefined
    Evidence: .sisyphus/evidence/task-4-live-human.json

  Scenario: Live API — field preservation
    Tool: Bash
    Steps:
      1. From the output of scenario 1, check first record for fields: recordId, lockId, recordType, recordTypeFromLock, success, keyboardPwd, lockDate, serverDate, username
      2. All must be present (some may be empty string, which is fine)
    Expected Result: All expected fields exist in the output records
    Failure Indicators: Any required field missing entirely from the record object
    Evidence: .sisyphus/evidence/task-4-live-fields.txt

  Scenario: Regression — list-passcodes still works
    Tool: Bash
    Steps:
      1. Run `tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672`
      2. Capture exit code
      3. Parse stdout as JSON array
    Expected Result: Exit 0, valid JSON array of passcodes
    Failure Indicators: Non-zero exit, "assertListSuccess" error, authentication failure
    Evidence: .sisyphus/evidence/task-4-regression-passcodes.json

  Scenario: Build + Lint clean
    Tool: Bash
    Steps:
      1. Run `pnpm build`
      2. Assert exit 0
      3. Run `pnpm lint`
      4. Assert exit 0
    Expected Result: Both commands succeed
    Failure Indicators: TypeScript errors, lint warnings/errors
    Evidence: .sisyphus/evidence/task-4-build-lint.txt
  ```

  **Commit**: NO (test-only task, no file changes)

- [x] 5. Commit all changes

  **What to do**:
  - Stage: `src/worker-tools/sifely/lib/api.ts`, `src/worker-tools/sifely/list-access-records.ts`, `AGENTS.md`
  - Commit message: `feat(sifely): upgrade list-access-records with pagination, full fields, and human labels`
  - Pre-commit check: `pnpm build && pnpm lint`
  - Verify `git status` is clean after commit

  **Must NOT do**:
  - Do NOT use `--no-verify`
  - Do NOT add `Co-authored-by` lines
  - Do NOT reference AI tools in the commit message

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single git commit
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: T6
  - **Blocked By**: T3, T4

  **References**: None needed — straightforward git operation.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Commit succeeds and repo is clean
    Tool: Bash
    Steps:
      1. Run `git add src/worker-tools/sifely/lib/api.ts src/worker-tools/sifely/list-access-records.ts AGENTS.md`
      2. Run `git commit -m "feat(sifely): upgrade list-access-records with pagination, full fields, and human labels"`
      3. Run `git status --short`
      4. Assert no modified/untracked files related to this work
    Expected Result: Commit succeeds, working tree clean
    Failure Indicators: Pre-commit hook failure, unstaged changes remaining
    Evidence: .sisyphus/evidence/task-5-commit.txt
  ```

  **Commit**: This IS the commit task.

- [x] 6. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ upgrade-list-access-records complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after T5)
  - **Blocks**: F1-F4
  - **Blocked By**: T5

  **References**: None.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "✅ upgrade-list-access-records complete — All tasks done. Come back to review results."`
      2. Assert exit 0
    Expected Result: Message delivered, exit 0
    Failure Indicators: Non-zero exit, network error
    Evidence: .sisyphus/evidence/task-6-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run every QA scenario from every task against live API (lock 24572672). Test: default dates, explicit dates, `--human` flag, pagination (if enough records), field preservation. Test regression: `list-passcodes.ts` still works. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Regression [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: `assertListSuccess` unchanged, `SifelyListResponse<T>` unchanged, `diagnose-access.ts` untouched. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                    | Files                                                                                               | Pre-commit                |
| ------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------- |
| 1      | `feat(sifely): upgrade list-access-records with pagination, full fields, and human labels` | `src/worker-tools/sifely/lib/api.ts`, `src/worker-tools/sifely/list-access-records.ts`, `AGENTS.md` | `pnpm build && pnpm lint` |

---

## Success Criteria

### Verification Commands

```bash
# Date defaults work
tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672
# Expected: exits 0, JSON array with records

# All fields preserved
tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const r=d[0]; const need=['recordId','lockId','recordType','recordTypeFromLock','success','lockDate','serverDate','username']; const miss=need.filter(k=>!(k in r)); if(miss.length){console.error('Missing:',miss);process.exit(1)} console.log('OK fields:', Object.keys(r).length)"
# Expected: exits 0, all required fields present

# Human labels
tsx src/worker-tools/sifely/list-access-records.ts --lock-id 24572672 --human | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(d[0]?.recordTypeLabel ? 0 : 1)"
# Expected: exits 0

# Regression — passcode tool unbroken
tsx src/worker-tools/sifely/list-passcodes.ts --lock-id 24572672
# Expected: exits 0, JSON array of passcodes

# Build + lint clean
pnpm build && pnpm lint
# Expected: both exit 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Live test passed against lock 24572672
- [ ] Regression check passed (list-passcodes still works)
- [ ] Build + lint clean
