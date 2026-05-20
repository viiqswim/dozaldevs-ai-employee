# Platform Submit-Output Tool

## TL;DR

> **Quick Summary**: Create a `submit-output.ts` shell tool that replaces manual `/tmp/summary.txt` file-writing with a validated tool invocation, fixing the `real-estate-motivation-bot` (and all future employees) failing despite completing their work. The platform AGENTS.md already documents the output contract, but the MiniMax model ignores the prose instruction — a tool call is a much stronger pattern for LLMs than "write this JSON to this file."
>
> **Deliverables**:
>
> - `src/worker-tools/platform/submit-output.ts` — validated output contract tool
> - Updated platform AGENTS.md Section 7 — references tool as preferred path
> - Updated `tool-usage-reference` SKILL.md — documents new tool CLI
> - Updated root AGENTS.md — platform tools entry
> - Updated `real-estate-motivation-bot` archetype instructions — explicitly calls the tool
> - Unit tests for the tool
> - E2E validation: motivation bot reaches `Done` consistently (2 runs)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 → T3/T4 → T7 → T8

---

## Context

### Original Request

The `real-estate-motivation-bot` employee reaches `Failed` status even though it successfully posts its motivational quote as a threaded Slack message. Investigation revealed the worker never writes `/tmp/summary.txt` (the platform's output contract), causing the harness to throw a fatal error at `opencode-harness.mts:521-525`.

### Interview Summary

**Key Discussions**:

- **Root cause confirmed**: The harness requires `/tmp/summary.txt` to exist. The agent posts to Slack but never writes the file. The harness throws → `markFailed()` → lifecycle transitions Executing → Failed.
- **Platform AGENTS.md is injected correctly**: The 6-layer concatenation pipeline works. Section 7 clearly documents the output contract. The MiniMax model just ignores the manual file-writing instruction.
- **Tool over prose**: User proposed a shell tool so agents call a tool instead of manually writing JSON. Tools are more reliably followed by LLMs — the model already successfully calls `post-message.ts` in the same session.
- **Harness stays strict**: User explicitly rejected making the harness lenient for `approval_required: false` employees. The fatal throw is correct behavior.
- **Archetype is DB-only**: `real-estate-motivation-bot` does not exist in `prisma/seed.ts`. It was created directly in the database.

**Research Findings**:

- **Injection pipeline**: `src/workers/config/agents.md` → Dockerfile COPY → `/app/AGENTS.md` → `resolveAgentsMd()` concatenates platform + runtime + tenant + archetype + rules + knowledge
- **Canonical pattern**: `src/worker-tools/platform/report-issue.ts` — `parseArgs` loop, `--help` to stdout, errors to stderr, JSON to stdout, `main().catch()` handler
- **Existing platform tools**: Only `report-issue.ts` exists in `src/worker-tools/platform/`
- **Task evidence**: Task `436a96cd-16be-432c-8b03-9dda65c32456` — harness threw "Model did not produce content" after successful Slack post

### Metis Review

**Identified Gaps** (addressed):

- **Archetype existence**: Confirmed DB-only. Plan updates instructions via SQL, not seed.
- **Mock mode**: Not needed — tool writes a local file with zero API calls.
- **Classification value**: `NO_ACTION_NEEDED` for fire-and-forget bot that posts and is done.
- **Fallback instructions**: Section 7 update keeps manual-write as fallback alongside tool reference.
- **Regression risk**: Changes are additive. Section 7 preserves manual-write path for existing employees.
- **Double-call safety**: Last write wins — harmless for `/tmp/summary.txt`.
- **Tool exit non-zero**: AGENTS.md will instruct fallback to manual write if tool fails.

---

## Work Objectives

### Core Objective

Replace the unreliable manual file-writing instruction with a first-class shell tool that makes the output contract a validated tool invocation, ensuring all employees (starting with `real-estate-motivation-bot`) consistently produce the required output files.

### Concrete Deliverables

- `src/worker-tools/platform/submit-output.ts` — new shell tool
- `src/workers/config/agents.md` Section 7 — updated to reference tool
- `src/workers/skills/tool-usage-reference/SKILL.md` — new tool documented
- `AGENTS.md` (root) — platform tools entry added
- `real-estate-motivation-bot` archetype instructions updated in DB
- `tests/worker-tools/platform/submit-output.test.ts` — unit tests
- E2E evidence: 2 successful `Done`-state runs of the motivation bot

### Definition of Done

- [ ] `tsx src/worker-tools/platform/submit-output.ts --help` exits 0 with usage text
- [ ] `tsx src/worker-tools/platform/submit-output.ts --summary "test"` exits 1 (missing `--classification`)
- [ ] Valid invocation writes correct JSON to `/tmp/summary.txt`
- [ ] Unit tests pass: `pnpm test -- --run tests/worker-tools/platform/submit-output.test.ts`
- [ ] Docker image rebuilt with new tool + updated AGENTS.md + updated skill
- [ ] `real-estate-motivation-bot` reaches `Done` status on 2 consecutive E2E triggers

### Must Have

- Tool validates `--classification` is exactly `NEEDS_APPROVAL` or `NO_ACTION_NEEDED`
- Tool validates `--confidence` is 0–1 if provided
- Tool writes valid JSON to `/tmp/summary.txt` AND echoes it to stdout
- Tool exits 0 on success, 1 on validation error
- Tool supports `--help` flag per platform convention
- Section 7 keeps manual-write as fallback (not removed)
- Tool must NOT touch `/tmp/approval-message.json`
- Tool must NOT require any env vars (no SUPABASE_URL, no SLACK_BOT_TOKEN — pure local file write)

### Must NOT Have (Guardrails)

- Must NOT modify `src/workers/opencode-harness.mts` — harness fatal behavior is correct
- Must NOT update any archetype other than `real-estate-motivation-bot`
- Must NOT add mock mode — tool has no external API calls
- Must NOT add `--dry-run`, `--append`, or other unrequested flags
- Must NOT remove manual-write instructions from Section 7 — they are the fallback
- Must NOT write to `/tmp/approval-message.json` — only the harness constructs approval cards
- Must NOT trigger `code-rotation` or `guest-messaging` employees during E2E

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest, `pnpm test`)
- **Automated tests**: YES (tests-after — unit tests for the tool)
- **Framework**: vitest (`pnpm test`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — invoke tool with various args, check exit codes, verify file contents
- **E2E lifecycle**: Use Bash (curl + poll) — trigger via admin API, poll task status until terminal

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — tool creation):
└── Task 1: Create submit-output.ts [quick]

Wave 2 (Tests + Docs — MAX PARALLEL):
├── Task 2: Unit tests for submit-output.ts (depends: 1) [quick]
├── Task 3: Update platform AGENTS.md Section 7 (depends: 1) [quick]
├── Task 4: Update tool-usage-reference SKILL.md (depends: 1) [quick]
├── Task 5: Update root AGENTS.md platform tools (depends: 1) [quick]
└── Task 6: Update motivation-bot archetype instructions in DB (depends: 1) [quick]

Wave 3 (Build):
└── Task 7: Docker image rebuild (depends: 1, 3, 4) [quick]

Wave 4 (E2E Validation):
└── Task 8: E2E — trigger motivation bot 2x, verify Done (depends: 6, 7) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Task 9: Telegram notification (after user okay)

Critical Path: T1 → T3/T4 → T7 → T8 → F1-F4 → user okay
Max Concurrent: 5 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks        | Wave |
| ---- | ---------- | ------------- | ---- |
| 1    | —          | 2, 3, 4, 5, 6 | 1    |
| 2    | 1          | F2            | 2    |
| 3    | 1          | 7             | 2    |
| 4    | 1          | 7             | 2    |
| 5    | 1          | —             | 2    |
| 6    | 1          | 8             | 2    |
| 7    | 1, 3, 4    | 8             | 3    |
| 8    | 6, 7       | F1-F4         | 4    |

### Agent Dispatch Summary

- **Wave 1**: **1** task — T1 → `quick`
- **Wave 2**: **5** tasks — T2-T6 → `quick`
- **Wave 3**: **1** task — T7 → `quick`
- **Wave 4**: **1** task — T8 → `unspecified-high`
- **FINAL**: **4** tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `src/worker-tools/platform/submit-output.ts`

  **What to do**:
  - Create the tool following the `report-issue.ts` canonical pattern exactly: `parseArgs` loop, `--help` to stdout, errors to stderr, `main().catch()` top-level handler
  - Required flags: `--summary` (string), `--classification` (enum: `NEEDS_APPROVAL` or `NO_ACTION_NEEDED`)
  - Optional flags: `--draft` (string), `--confidence` (number 0–1), `--reasoning` (string), `--urgency` (boolean flag), `--metadata` (JSON string)
  - `--help` flag: prints usage with all flags, env vars (none required), output format, exit codes. Exit 0
  - Validation: reject unknown `--classification` values with stderr error + exit 1. Reject `--confidence` outside 0–1 with stderr error + exit 1. Reject missing `--summary` or `--classification` with stderr error + exit 1
  - On success: construct JSON object from all provided flags, write to `/tmp/summary.txt` using `fs.writeFileSync`, ALSO write to stdout so the agent sees confirmation. Exit 0
  - JSON must include only fields that were provided (don't include `null` for omitted optionals)
  - The tool must NOT require any environment variables — no SUPABASE_URL, SLACK_BOT_TOKEN, or TASK_ID. It is a pure local file writer
  - The tool must NOT touch `/tmp/approval-message.json`

  **Must NOT do**:
  - Do NOT add mock mode — tool has no external API calls
  - Do NOT add `--dry-run`, `--append`, or other unrequested flags
  - Do NOT require any network access or env vars
  - Do NOT write to any path other than `/tmp/summary.txt`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file tool creation following a clear canonical pattern
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers file structure, CLI conventions, and checklist for new worker tools

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: T2, T3, T4, T5, T6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/worker-tools/platform/report-issue.ts` — **THE** canonical pattern. Copy its structure exactly: `interface Args`, `parseArgs()` function with for-loop, `--help` to stdout via `process.stdout.write()`, errors to stderr via `process.stderr.write()`, `main().catch()` handler. The key difference: this tool writes a file instead of calling PostgREST/Slack
  - `src/worker-tools/platform/report-issue.ts:31-54` — `parseArgs` implementation pattern to follow
  - `src/worker-tools/platform/report-issue.ts:74-101` — `main()` structure: help check → validation → action → stdout output
  - `src/worker-tools/platform/report-issue.ts:211-214` — Top-level `main().catch()` error handler pattern

  **API/Type References** (output schema):
  - `src/workers/config/agents.md:76-111` — Section 7: the JSON schema for `/tmp/summary.txt` that this tool must produce. Required: `summary` (string), `classification` (string). Optional: `draft`, `confidence`, `reasoning`, `urgency`, `metadata`
  - `src/workers/lib/output-schema.mts` — The harness's `parseStandardOutput()` function that will consume the file this tool writes. Verify the tool's output JSON is compatible

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — valid invocation writes correct JSON
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: tsx src/worker-tools/platform/submit-output.ts --summary "Posted motivational quote" --classification "NO_ACTION_NEEDED" --confidence 0.95
      2. Check exit code: echo $?
      3. Read /tmp/summary.txt: cat /tmp/summary.txt
      4. Parse JSON: node -e "const j=JSON.parse(require('fs').readFileSync('/tmp/summary.txt','utf8')); console.log(j.summary === 'Posted motivational quote' && j.classification === 'NO_ACTION_NEEDED' && j.confidence === 0.95 ? 'PASS' : 'FAIL')"
    Expected Result: Exit code 0. stdout shows JSON. /tmp/summary.txt contains valid JSON with correct fields. Parse check prints PASS
    Failure Indicators: Non-zero exit code, missing file, malformed JSON, wrong field values
    Evidence: .sisyphus/evidence/task-1-happy-path.txt

  Scenario: Missing required flag — exits 1 with error
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: tsx src/worker-tools/platform/submit-output.ts --summary "test" 2>&1; echo "exit:$?"
      2. Run: tsx src/worker-tools/platform/submit-output.ts --classification "NO_ACTION_NEEDED" 2>&1; echo "exit:$?"
    Expected Result: Both exit 1. stderr contains "required" error message for the missing flag
    Failure Indicators: Exit 0, no error message, or wrong error message
    Evidence: .sisyphus/evidence/task-1-missing-args.txt

  Scenario: Invalid classification — exits 1 with error
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: tsx src/worker-tools/platform/submit-output.ts --summary "test" --classification "INVALID_VALUE" 2>&1; echo "exit:$?"
    Expected Result: Exit 1. stderr says classification must be NEEDS_APPROVAL or NO_ACTION_NEEDED
    Failure Indicators: Exit 0, file written with invalid classification
    Evidence: .sisyphus/evidence/task-1-invalid-classification.txt

  Scenario: Help flag — exits 0 with usage
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: tsx src/worker-tools/platform/submit-output.ts --help; echo "exit:$?"
    Expected Result: Exit 0. stdout contains usage text with all flags documented
    Failure Indicators: Non-zero exit, no output, or stderr output
    Evidence: .sisyphus/evidence/task-1-help.txt
  ```

  **Commit**: YES
  - Message: `feat(platform): add submit-output tool for output contract`
  - Files: `src/worker-tools/platform/submit-output.ts`
  - Pre-commit: `tsx src/worker-tools/platform/submit-output.ts --help`

- [x] 2. Unit tests for `submit-output.ts`

  **What to do**:
  - Create `tests/worker-tools/platform/submit-output.test.ts` with vitest
  - Test cases:
    1. `--help` exits 0 and prints usage to stdout
    2. Missing `--summary` exits 1 with stderr error
    3. Missing `--classification` exits 1 with stderr error
    4. Invalid `--classification` value exits 1 with stderr error
    5. Valid invocation with required-only flags writes correct JSON to `/tmp/summary.txt`
    6. Valid invocation with all optional flags includes them in JSON output
    7. `--confidence` outside 0–1 exits 1 with stderr error
    8. Special characters in `--summary` (quotes, newlines) are JSON-escaped correctly
  - Use `child_process.execSync` or `execa` to invoke the tool as a subprocess (same pattern as `tests/worker-tools/slack/post-message-auto-env.test.ts`)
  - Clean up `/tmp/summary.txt` in `afterEach` to avoid test pollution

  **Must NOT do**:
  - Do NOT test `report-issue.ts` or any other tool — out of scope
  - Do NOT import the tool's internals — test via CLI invocation only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward test file following existing test patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T3, T4, T5, T6)
  - **Blocks**: F2
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `tests/worker-tools/slack/post-message-auto-env.test.ts` — Test pattern for shell tools: subprocess invocation, stdout/stderr capture, exit code checks, file content verification

  **API/Type References**:
  - `src/worker-tools/platform/submit-output.ts` — The tool under test (created in T1)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: T1 complete (submit-output.ts exists)
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/platform/submit-output.test.ts
      2. Check output for pass/fail count
    Expected Result: 8 tests, 0 failures
    Failure Indicators: Any test failure or test file not found
    Evidence: .sisyphus/evidence/task-2-unit-tests.txt
  ```

  **Commit**: YES
  - Message: `test(platform): add unit tests for submit-output tool`
  - Files: `tests/worker-tools/platform/submit-output.test.ts`
  - Pre-commit: `pnpm test -- --run tests/worker-tools/platform/submit-output.test.ts`

- [x] 3. Update platform AGENTS.md Section 7 — reference tool as preferred path

  **What to do**:
  - Edit `src/workers/config/agents.md` Section 7 (Output Format, lines 76–111)
  - Add the `submit-output.ts` tool as the **preferred** method at the top of the section
  - Keep the existing manual-write instructions as a **fallback** (do NOT remove them)
  - Structure: "Use the submit-output tool (preferred). If the tool is unavailable or fails, fall back to manual write."
  - Add example invocation: `tsx /tools/platform/submit-output.ts --summary "..." --classification "NO_ACTION_NEEDED"`
  - Add example with all flags for the NEEDS_APPROVAL case
  - Update the Summary section at the bottom (line 162) to reference the tool
  - Remind agents: "If submit-output.ts fails, fall back to writing /tmp/summary.txt manually as described below"

  **Must NOT do**:
  - Do NOT remove the existing JSON schema documentation — it serves as the fallback reference
  - Do NOT change Section 8 (Error Handling) — it already correctly instructs writing on error
  - Do NOT change any other section of the platform AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation edit in a single file, clear instructions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T4, T5, T6)
  - **Blocks**: T7 (Docker rebuild needs updated file baked into image)
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/workers/config/agents.md:76-111` — Current Section 7 content to modify
  - `src/workers/config/agents.md:154-164` — Summary section to update
  - `src/workers/config/agents.md:22-24` — Section 3 smoke test pattern showing how tool invocations are documented

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Section 7 references the tool and keeps fallback
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/workers/config/agents.md
      2. Verify Section 7 mentions "submit-output.ts" or "submit-output"
      3. Verify Section 7 still contains the JSON schema (summary, classification fields)
      4. Verify the word "fallback" or "fall back" appears in Section 7
      5. Verify the Summary section (near end of file) mentions the tool
    Expected Result: Tool referenced as preferred path, manual-write kept as fallback, JSON schema preserved
    Failure Indicators: Manual-write instructions removed, tool not mentioned, schema deleted
    Evidence: .sisyphus/evidence/task-3-agents-md-update.txt
  ```

  **Commit**: YES (grouped with T4 + T5)
  - Message: `docs: update AGENTS.md and skills for submit-output tool`
  - Files: `src/workers/config/agents.md`, `src/workers/skills/tool-usage-reference/SKILL.md`, `AGENTS.md`

- [x] 4. Update `tool-usage-reference` SKILL.md — document new tool

  **What to do**:
  - Edit `src/workers/skills/tool-usage-reference/SKILL.md`
  - Add a new entry in the Platform Tools section for `submit-output.ts`
  - Document: full CLI syntax, all flags (required and optional), output format, exit codes, examples
  - Follow the same documentation format used for other tools in the skill
  - Include both a minimal example (`--summary` + `--classification` only) and a full example (all flags)

  **Must NOT do**:
  - Do NOT modify documentation for any existing tool
  - Do NOT change the skill's structure or format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation addition to an existing skill file
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Step 6 covers SKILL.md documentation requirements

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T3, T5, T6)
  - **Blocks**: T7 (Docker rebuild needs updated skill baked into image)
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `src/workers/skills/tool-usage-reference/SKILL.md` — Existing skill file. Add new entry following the same format as other tool entries (report-issue, post-message, etc.)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill documents the new tool
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read src/workers/skills/tool-usage-reference/SKILL.md
      2. Search for "submit-output"
      3. Verify all flags are documented: --summary, --classification, --draft, --confidence, --reasoning, --urgency, --metadata, --help
      4. Verify exit codes documented (0 success, 1 error)
    Expected Result: Tool fully documented in skill with all flags and examples
    Failure Indicators: Tool missing from skill, incomplete flag documentation
    Evidence: .sisyphus/evidence/task-4-skill-update.txt
  ```

  **Commit**: YES (grouped with T3 + T5)

- [x] 5. Update root AGENTS.md — add platform tool entry

  **What to do**:
  - Edit the root `AGENTS.md` file
  - In the "OpenCode Worker" section, find the platform tools list (near `tsx /tools/platform/report-issue.ts`)
  - Add a one-line entry for `submit-output.ts` with brief description: `tsx /tools/platform/submit-output.ts --summary "..." --classification "NO_ACTION_NEEDED|NEEDS_APPROVAL"` — writes the output contract JSON to `/tmp/summary.txt`
  - Keep the entry concise — AGENTS.md is loaded into every LLM call, so brevity matters

  **Must NOT do**:
  - Do NOT modify any other section of AGENTS.md
  - Do NOT add verbose documentation — that belongs in the skill, not AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line addition to existing file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T3, T4, T6)
  - **Blocks**: None
  - **Blocked By**: T1

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Find the "OpenCode Worker" section's tool listing. Add entry near the existing `report-issue.ts` line

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Root AGENTS.md lists the new tool
    Tool: Bash
    Preconditions: None
    Steps:
      1. Search AGENTS.md for "submit-output"
      2. Verify the entry is in the OpenCode Worker / platform tools section
    Expected Result: One-line entry for submit-output.ts present
    Failure Indicators: Tool not mentioned, or added in wrong section
    Evidence: .sisyphus/evidence/task-5-root-agents-md.txt
  ```

  **Commit**: YES (grouped with T3 + T4)

- [x] 6. Update `real-estate-motivation-bot` archetype instructions in DB

  **What to do**:
  - Query the current archetype instructions: `SELECT id, instructions FROM archetypes WHERE role_name = 'real-estate-motivation-bot';`
  - Append to the existing instructions: a clear directive to call `submit-output.ts` after completing the primary task
  - The appended text should say something like: "After posting the motivational message to Slack, you MUST report your output using the submit-output tool: `tsx /tools/platform/submit-output.ts --summary 'Posted motivational quote to Slack' --classification 'NO_ACTION_NEEDED'`"
  - Use SQL UPDATE via psql to modify the instructions in-place
  - Verify the update took effect with a SELECT query

  **Must NOT do**:
  - Do NOT modify any other archetype
  - Do NOT change `prisma/seed.ts` — the archetype is DB-only and adding it to seed is out of scope
  - Do NOT change the archetype's `risk_model`, `model`, or any other field — only `instructions`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL UPDATE statement
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T3, T4, T5)
  - **Blocks**: T8 (E2E needs updated instructions)
  - **Blocked By**: T1

  **References**:

  **External References**:
  - Database: `postgresql://postgres:postgres@localhost:54322/ai_employee` — direct psql access for the UPDATE

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype instructions mention submit-output tool
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT instructions FROM archetypes WHERE role_name = 'real-estate-motivation-bot';"
      2. Verify output contains "submit-output"
    Expected Result: Instructions field contains the submit-output tool invocation directive
    Failure Indicators: Instructions unchanged, tool not mentioned, wrong archetype modified
    Evidence: .sisyphus/evidence/task-6-archetype-update.txt
  ```

  **Commit**: NO (DB-only change, no code change)

- [x] 7. Docker image rebuild

  **What to do**:
  - Run `docker build -t ai-employee-worker:latest .` from the project root
  - This bakes in: the new `submit-output.ts` tool (via worker-tools COPY), the updated `agents.md` (via config COPY), and the updated `tool-usage-reference` SKILL.md (via skills COPY)
  - Verify the build succeeds (exit code 0)
  - **IMPORTANT**: This is a long-running command. Use tmux: `tmux new-session -d -s ai-build ...`
  - After build completes, kill the tmux session

  **Must NOT do**:
  - Do NOT run the build without tmux — it takes >30 seconds
  - Do NOT forget to kill the tmux session after completion

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: T8
  - **Blocked By**: T1, T3, T4

  **References**:

  **External References**:
  - `Dockerfile` — Lines 81-82: `COPY src/workers/skills/ /app/.opencode/skills/` and `COPY src/workers/config/agents.md /app/AGENTS.md`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux)
    Preconditions: T1, T3, T4 complete
    Steps:
      1. Kill any existing ai-build session: tmux kill-session -t ai-build 2>/dev/null
      2. Launch: tmux new-session -d -s ai-build -x 220 -y 50
      3. Send: docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log
      4. Poll every 30s until EXIT_CODE appears
      5. Verify EXIT_CODE:0
      6. Kill session: tmux kill-session -t ai-build
    Expected Result: Build completes with EXIT_CODE:0
    Failure Indicators: Non-zero exit code, build errors in log
    Evidence: .sisyphus/evidence/task-7-docker-build.txt
  ```

  **Commit**: NO (build artifact, not source)

- [x] 8. E2E validation — trigger `real-estate-motivation-bot` 2x, verify `Done`

  **What to do**:
  - **Prerequisites check**: Verify services are running — gateway (`curl localhost:7700/health`), Inngest (`curl localhost:8288`), dev server logs show Socket Mode connected
  - **Run 1**: Trigger the bot via admin API. Poll task status every 15 seconds (max 5 minutes). Verify it reaches `Done` (not `Failed`). Record the task ID, all state transitions, and the Slack message
  - **Run 2**: Trigger again. Same verification. This confirms consistency
  - For each run, capture: task ID, final status, state transitions via `task_status_log`, and the Slack message content
  - **CRITICAL**: Do NOT trigger `code-rotation` or `guest-messaging` employees. Only `real-estate-motivation-bot`
  - The tenant ID and slug must match the existing DB archetype. Query first: `SELECT tenant_id FROM archetypes WHERE role_name = 'real-estate-motivation-bot';`
  - If either run reaches `Failed`, capture the error from task metadata and Fly/Docker logs

  **Must NOT do**:
  - Do NOT trigger any employee other than `real-estate-motivation-bot`
  - Do NOT skip the second run — consistency requires at least 2 passes
  - Do NOT declare success if either run reaches `Failed`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E validation requires multiple sequential operations, polling, and diagnostic judgment if something fails
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: T6, T7

  **References**:

  **External References**:
  - Admin API trigger: `POST /admin/tenants/:tenantId/employees/real-estate-motivation-bot/trigger`
  - Admin API status: `GET /admin/tenants/:tenantId/tasks/:id`
  - DB task_status_log: `SELECT * FROM task_status_log WHERE task_id = '<id>' ORDER BY created_at;`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Run 1 — motivation bot reaches Done
    Tool: Bash (curl + poll)
    Preconditions: Docker rebuilt (T7), archetype updated (T6), services running
    Steps:
      1. Query tenant_id: psql ... -c "SELECT tenant_id FROM archetypes WHERE role_name = 'real-estate-motivation-bot';"
      2. Trigger: curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT_ID/employees/real-estate-motivation-bot/trigger" -H "Content-Type: application/json" -d '{}'
      3. Extract task_id from response JSON
      4. Poll every 15s: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT_ID/tasks/$TASK_ID" — extract status field
      5. Continue until status is Done or Failed (max 5 min / 20 polls)
      6. Query transitions: psql ... -c "SELECT old_status, new_status, created_at FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
    Expected Result: Final status = Done. Transitions include Executing → Submitting → Done (not Executing → Failed)
    Failure Indicators: Status = Failed, timeout after 5 min, trigger returns non-202
    Evidence: .sisyphus/evidence/task-8-e2e-run1.txt

  Scenario: Run 2 — consistency verification
    Tool: Bash (curl + poll)
    Preconditions: Run 1 completed (regardless of result)
    Steps:
      1. Wait 30 seconds after Run 1 completes
      2. Trigger again: same curl command as Run 1
      3. Extract task_id, poll until terminal state
      4. Query transitions
    Expected Result: Final status = Done. Both runs reached Done = consistent
    Failure Indicators: Status = Failed on second run (flaky), timeout
    Evidence: .sisyphus/evidence/task-8-e2e-run2.txt
  ```

  **Commit**: NO (E2E validation, no code changes)

- [x] 9. Telegram notification

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ submit-output-tool plan complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4 + user okay

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run tests/worker-tools/platform/submit-output.test.ts`. Review `submit-output.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify it follows the `report-issue.ts` canonical pattern. Check AI slop: excessive comments, over-abstraction.
      Output: `Tests [N pass/N fail] | Code Quality [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `submit-output.ts` with: valid args (verify file written), missing args (verify exit 1), invalid classification (verify exit 1), special characters in summary (verify JSON escaping). Then check E2E evidence from T8 — verify 2 task IDs both reached `Done`.
      Output: `Tool Tests [N/N pass] | E2E [2/2 Done] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no harness changes, no other archetype updates, no mock mode. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Must NOT [N/N clean] | VERDICT`

---

## Commit Strategy

| Task     | Commit                                                       | Files                                                                                           |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| T1       | `feat(platform): add submit-output tool for output contract` | `src/worker-tools/platform/submit-output.ts`                                                    |
| T2       | `test(platform): add unit tests for submit-output tool`      | `tests/worker-tools/platform/submit-output.test.ts`                                             |
| T3+T4+T5 | `docs: update AGENTS.md and skills for submit-output tool`   | `src/workers/config/agents.md`, `src/workers/skills/tool-usage-reference/SKILL.md`, `AGENTS.md` |
| T6       | No commit (DB update only)                                   | —                                                                                               |

---

## Success Criteria

### Verification Commands

```bash
# Tool works
tsx src/worker-tools/platform/submit-output.ts --help  # Expected: usage text, exit 0
tsx src/worker-tools/platform/submit-output.ts --summary "test" --classification "NO_ACTION_NEEDED"  # Expected: JSON to stdout + /tmp/summary.txt written

# Tests pass
pnpm test -- --run tests/worker-tools/platform/submit-output.test.ts  # Expected: all pass

# E2E
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT_ID/employees/real-estate-motivation-bot/trigger" \
  -H "Content-Type: application/json" -d '{}'  # Expected: 202 + task_id, task reaches Done
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] 2 consecutive E2E runs reach Done
