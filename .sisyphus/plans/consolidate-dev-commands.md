# Consolidate Dev Commands — `pnpm dev:start` + `pnpm dev:local` → `pnpm dev`

## TL;DR

> **Quick Summary**: Merge two overlapping dev startup scripts into a single `pnpm dev` command that auto-detects Cloudflare tunnel availability and gracefully skips it when absent.
>
> **Deliverables**:
>
> - `scripts/dev.ts` — consolidated dev script with auto-tunnel detection
> - Updated `package.json` with single `dev` script entry
> - All references updated across AGENTS.md, README.md, ~5 scripts, ~12 docs files
> - `scripts/dev-start.ts` and `scripts/dev-local.ts` deleted
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 → T2-T6 (parallel) → T7

---

## Context

### Original Request

User observed that having both `pnpm dev:start` and `pnpm dev:local` is confusing — they always use `dev:local` anyway. With contributors expected soon, a single `pnpm dev` entry point that "just works" on any machine is the right move.

### Interview Summary

**Key Discussions**:

- User always uses `dev:local`, never `dev:start`
- Solo developer now, expecting contributors soon
- The tunnel should be auto-detected and gracefully skipped if cloudflared isn't configured
- Agreed on unified `pnpm dev` with flags: `--skip-build`, `--reset`, `--no-tunnel`, `--help`

**Research Findings**:

- `dev-start.ts` (379 lines) and `dev-local.ts` (722 lines) share ~60% duplicated code (color helpers, .env loading, cleanup, waitForHttp, Docker Compose start, Inngest start, Gateway start)
- They use DIFFERENT Docker Compose files: `docker/docker-compose.yml` vs `docker/supabase-services.yml`
- They use DIFFERENT PostgREST ports: 54321 vs 54331
- They have DIFFERENT required env var lists: dev-start requires engineering-specific vars (JIRA_WEBHOOK_SECRET, GITHUB_TOKEN), dev-local requires employee-focused vars (ADMIN_API_KEY, ENCRYPTION_KEY, SLACK_APP_TOKEN, etc.)
- `dev-local.ts` has additional features: Docker build, Cloudflare tunnel, Fly.io hybrid mode, Hostfully webhook registration, VLRE archetype notification_channel fix
- `dev-e2e.ts` is independent (doesn't import from either)
- ~64 references across ~25 files need updating

### Self-Review Gap Analysis

**Identified Gaps** (addressed):

- Docker Compose file divergence: Use `supabase-services.yml` (dev-local's, the current/correct one)
- PostgREST port divergence: Use 54331 (dev-local's, matches current infrastructure)
- Engineering env vars in dev-start: Drop JIRA_WEBHOOK_SECRET and GITHUB_TOKEN from required list (engineering is deprecated)
- Hostfully webhook registration depends on tunnel URL: Skip registration when `--no-tunnel` or tunnel unavailable
- AGENTS.md references `dev-start.ts` line 329 for USE_LOCAL_DOCKER: Update line reference after consolidation
- cloudflared installed but config missing: Warn about setup, don't crash

---

## Work Objectives

### Core Objective

Replace two overlapping dev startup scripts with a single `pnpm dev` command that auto-detects tunnel availability and works out-of-the-box for contributors without cloudflared.

### Concrete Deliverables

- `scripts/dev.ts` — the unified dev script
- `package.json` — updated scripts section
- All codebase references updated (AGENTS.md, README.md, scripts, docs)
- `scripts/dev-start.ts` deleted
- `scripts/dev-local.ts` deleted

### Definition of Done

- [ ] `pnpm dev --help` shows all flags (--reset, --skip-build, --no-tunnel)
- [ ] `pnpm dev --no-tunnel --skip-build` starts gateway + inngest + docker compose (no tunnel, no build)
- [ ] `pnpm dev --skip-build` auto-detects tunnel and starts it if available
- [ ] No references to `dev:start` or `dev:local` remain in codebase (except git history)
- [ ] `pnpm build` passes clean

### Must Have

- Auto-detection of cloudflared: check binary + config file existence
- Graceful skip with helpful warning when cloudflared not configured
- `--no-tunnel` explicit opt-out flag
- All existing dev-local.ts functionality preserved (Docker build, hybrid mode, Hostfully webhook, etc.)
- All existing flags preserved (`--skip-build`, `--reset`, `--help`)

### Must NOT Have (Guardrails)

- Do NOT refactor script internals (no DRY cleanup, no restructuring helper functions)
- Do NOT change Docker Compose files or infrastructure behavior
- Do NOT add new features beyond tunnel auto-detection and `--no-tunnel` flag
- Do NOT modify `dev-e2e.ts` behavior (it's independent)
- Do NOT keep `dev:start` or `dev:local` as aliases — clean cut

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None — dev scripts are not unit-tested (verified via QA scenarios only)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI**: Use Bash — run commands, validate output, check exit codes
- **Content**: Use Grep — verify no stale references remain

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential):
└── Task 1: Create scripts/dev.ts with tunnel auto-detection [quick]

Wave 2 (Reference updates — MAX PARALLEL, after Wave 1):
├── Task 2: Update package.json scripts [quick]
├── Task 3: Update AGENTS.md references [quick]
├── Task 4: Update README.md references [quick]
├── Task 5: Update scripts referencing dev:start or dev:local [quick]
└── Task 6: Update docs files referencing dev:start or dev:local [quick]

Wave 3 (Cleanup + verification — after Wave 2):
└── Task 7: Delete old scripts, build verification, codebase-wide reference sweep [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T2-T7  | 1    |
| T2   | T1         | T7     | 2    |
| T3   | T1         | T7     | 2    |
| T4   | T1         | T7     | 2    |
| T5   | T1         | T7     | 2    |
| T6   | T1         | T7     | 2    |
| T7   | T2-T6      | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 5 tasks — T2-T6 → `quick` (all parallel)
- **Wave 3**: 1 task — T7 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `scripts/dev.ts` — Consolidated dev script with auto-tunnel detection

  **What to do**:
  - Copy `scripts/dev-local.ts` to `scripts/dev.ts`
  - Update the file header comment: change description to "Unified local dev environment launcher" and usage to `npx tsx scripts/dev.ts [--reset] [--skip-build] [--no-tunnel] [--help]`
  - Add `--no-tunnel` to `KNOWN_FLAGS` array (line 83) and parse it: `const noTunnelFlag = args.includes('--no-tunnel');`
  - Add `--no-tunnel` to the `--help` output section — add a line describing it: `"  --no-tunnel   Skip Cloudflare tunnel (auto-detected if cloudflared is absent)"`
  - **Make tunnel pre-flight checks NON-FATAL**: In Step 1 (pre-flight checks), change the 3 tunnel-related checks (cloudflared binary, tunnel config file, tunnel credentials file) from hard failures (`prereqFail = true`) to soft warnings. The pattern:
    ```typescript
    let tunnelAvailable = true;
    // cloudflared binary check
    try {
      await $`which cloudflared`;
      ok('cloudflared found');
    } catch {
      warn(
        'cloudflared not found — tunnel will be skipped. Install: brew install cloudflare/cloudflare/cloudflared',
      );
      tunnelAvailable = false;
    }
    // tunnel config check
    if (!existsSync(TUNNEL_CONFIG)) {
      warn(`Tunnel config not found: ${TUNNEL_CONFIG} — tunnel will be skipped`);
      tunnelAvailable = false;
    } else {
      ok('Tunnel config found');
    }
    // tunnel creds check
    if (!existsSync(TUNNEL_CREDS)) {
      warn(`Tunnel credentials not found: ${TUNNEL_CREDS} — tunnel will be skipped`);
      tunnelAvailable = false;
    } else {
      ok('Tunnel credentials found');
    }
    ```
  - **Gate tunnel startup on availability**: In Step 7 (Start Cloudflare Tunnel), wrap the entire tunnel section in `if (!noTunnelFlag && tunnelAvailable) { ... } else { info('Tunnel skipped' + (noTunnelFlag ? ' (--no-tunnel)' : ' (cloudflared not configured)')); }`
  - **Gate Hostfully webhook registration on tunnel**: In Step 6c (Hostfully webhook registration), add a check: if tunnel is not starting (either `noTunnelFlag` or `!tunnelAvailable`), skip webhook registration with `info('Hostfully webhook registration skipped — no tunnel')`
  - Update the summary banner to conditionally show tunnel URL only when tunnel started
  - Update the `--help` examples section to use `pnpm dev` instead of `pnpm dev:local`

  **Must NOT do**:
  - Do NOT refactor or restructure any helper functions (color helpers, waitForHttp, cleanup, etc.)
  - Do NOT change Docker Compose file reference (`docker/supabase-services.yml`)
  - Do NOT change any existing behavior — only add tunnel auto-detection and `--no-tunnel` flag
  - Do NOT change the required env vars list
  - Do NOT add comments explaining the consolidation history

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation with clear, mechanical changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant for a script file modification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: T2, T3, T4, T5, T6, T7
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (source file to copy from):
  - `scripts/dev-local.ts` — THE source file. Copy entirely, then modify. Lines 83-90 (flag parsing), 238-261 (tunnel prereqs), 644-697 (tunnel startup), 564-641 (Hostfully webhook registration), 51-80 (help text)

  **API/Type References**:
  - `scripts/dev-local.ts:44` — `warn` helper already exists (needed for soft tunnel warnings)
  - `scripts/dev-local.ts:83` — `KNOWN_FLAGS` array (add `--no-tunnel` here)
  - `scripts/dev-local.ts:111-116` — Tunnel constants (TUNNEL_CONFIG, TUNNEL_CREDS, TUNNEL_URL)

  **WHY Each Reference Matters**:
  - The source file IS the implementation — copy it first, then make 4 surgical edits (flag parsing, prereq softening, tunnel gating, webhook gating)
  - The `warn` helper already exists so tunnel skip messages will match visual style

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Help output shows all flags including --no-tunnel
    Tool: Bash
    Preconditions: scripts/dev.ts exists
    Steps:
      1. Run: tsx scripts/dev.ts --help
      2. Check output contains "--no-tunnel"
      3. Check output contains "--skip-build"
      4. Check output contains "--reset"
      5. Check output contains "pnpm dev" (not "pnpm dev:local")
    Expected Result: All 4 flags documented, examples use "pnpm dev"
    Failure Indicators: Missing --no-tunnel in help, or still says "dev:local"
    Evidence: .sisyphus/evidence/task-1-help-output.txt

  Scenario: Unknown flag is rejected
    Tool: Bash
    Preconditions: scripts/dev.ts exists
    Steps:
      1. Run: tsx scripts/dev.ts --bogus 2>&1; echo "EXIT:$?"
      2. Check output contains "Unknown flag: --bogus"
      3. Check exit code is 1
    Expected Result: Script exits with error on unknown flag
    Failure Indicators: Script starts normally or exits with code 0
    Evidence: .sisyphus/evidence/task-1-unknown-flag.txt

  Scenario: TypeScript compiles clean
    Tool: Bash
    Preconditions: scripts/dev.ts exists
    Steps:
      1. Run: pnpm build
      2. Check exit code is 0
    Expected Result: Zero TypeScript errors
    Failure Indicators: Any compilation error
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-help-output.txt
  - [ ] task-1-unknown-flag.txt
  - [ ] task-1-build.txt

  **Commit**: YES
  - Message: `feat(scripts): add unified dev.ts with auto-tunnel detection`
  - Files: `scripts/dev.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Update `package.json` scripts

  **What to do**:
  - Replace the two script entries:
    ```json
    "dev:start": "tsx scripts/dev-start.ts",
    "dev:local": "tsx scripts/dev-local.ts",
    ```
    With a single entry:
    ```json
    "dev": "tsx scripts/dev.ts",
    ```
  - Keep `dev:e2e` unchanged

  **Must NOT do**:
  - Do NOT change any other scripts in package.json
  - Do NOT change any dependencies
  - Do NOT add aliases for the old commands

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3-line edit in a JSON file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T3, T4, T5, T6)
  - **Blocks**: T7
  - **Blocked By**: T1

  **References**:
  - `package.json:20-22` — Current script entries to replace

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: package.json has correct dev script
    Tool: Bash
    Preconditions: package.json edited
    Steps:
      1. Run: node -e "const p = require('./package.json'); console.log(JSON.stringify(p.scripts))"
      2. Check output contains "dev":"tsx scripts/dev.ts"
      3. Check output does NOT contain "dev:start"
      4. Check output does NOT contain "dev:local"
      5. Check output contains "dev:e2e" (unchanged)
    Expected Result: Single "dev" entry, no "dev:start" or "dev:local"
    Failure Indicators: Old entries still present, or dev entry missing
    Evidence: .sisyphus/evidence/task-2-package-scripts.txt
  ```

  **Commit**: NO (groups with T3-T6)

- [x] 3. Update `AGENTS.md` references

  **What to do**:
  - Replace ALL references to `pnpm dev:start` with `pnpm dev`
  - Replace ALL references to `pnpm dev:local` with `pnpm dev`
  - Replace ALL references to `dev-start.ts` with `dev.ts` (where referring to the script file)
  - Replace the reference on line 75: `Set programmatically by \`dev-start.ts\` (line 329)`— update to`dev.ts`and note the line number may differ (remove the specific line number, say "Set programmatically by`dev.ts`")
  - In the Commands table (around line 337-338): merge the two rows into one: `| Start services | \`pnpm dev\` |`
  - In the long-running commands list (around line 444): replace `pnpm dev:start`, `pnpm dev:local` with `pnpm dev`
  - Line 506: Change `pnpm dev:local` to `pnpm dev`

  **Must NOT do**:
  - Do NOT change any non-reference content in AGENTS.md
  - Do NOT restructure sections
  - Do NOT update any other documentation conventions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Find-and-replace text edits across one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T4, T5, T6)
  - **Blocks**: T7
  - **Blocked By**: T1

  **References**:
  - `AGENTS.md:75` — USE_LOCAL_DOCKER reference to dev-start.ts
  - `AGENTS.md:337-338` — Commands table with both entries
  - `AGENTS.md:444` — Long-running commands list
  - `AGENTS.md:506` — Preferred dev:local reference

  **WHY Each Reference Matters**:
  - AGENTS.md is loaded into every LLM call — stale references will cause agents to run wrong commands

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stale references in AGENTS.md
    Tool: Bash
    Preconditions: AGENTS.md edited
    Steps:
      1. Run: grep -n "dev:start\|dev:local\|dev-start\.ts\|dev-local\.ts" AGENTS.md || echo "CLEAN"
      2. Check output is "CLEAN"
    Expected Result: Zero matches for old command names
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-3-agents-refs.txt

  Scenario: New references are correct
    Tool: Bash
    Preconditions: AGENTS.md edited
    Steps:
      1. Run: grep -c "pnpm dev" AGENTS.md
      2. Verify count is >= 3 (commands table, long-running list, preferred section)
    Expected Result: Multiple references to "pnpm dev" exist
    Evidence: .sisyphus/evidence/task-3-agents-new-refs.txt
  ```

  **Commit**: NO (groups with T2, T4-T6)

- [x] 4. Update `README.md` references

  **What to do**:
  - Line 11: Change `pnpm dev:start` to `pnpm dev`
  - Line 12: Change `pnpm dev:local` to `pnpm dev --skip-build` (since the context is "full stack with Cloudflare tunnel")
  - Lines 115-116 (Scripts table): Merge the two rows for dev-start.ts and dev-local.ts into a single row: `| \`dev.ts\` | \`pnpm dev\` | Full local stack: Docker Compose + Inngest + Gateway + auto-detected Cloudflare tunnel + Docker worker image build. Flags: \`--reset\`, \`--skip-build\`, \`--no-tunnel\` |`
  - Line 140: Change `pnpm dev:start` to `pnpm dev`
  - Any other references to `dev:start` or `dev:local` → `pnpm dev`

  **Must NOT do**:
  - Do NOT restructure README sections
  - Do NOT update non-reference content

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Find-and-replace text edits in one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T3, T5, T6)
  - **Blocks**: T7
  - **Blocked By**: T1

  **References**:
  - `README.md:11-12` — Quick Start section
  - `README.md:115-116` — Scripts table
  - `README.md:140` — Infrastructure note

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stale references in README.md
    Tool: Bash
    Preconditions: README.md edited
    Steps:
      1. Run: grep -n "dev:start\|dev:local\|dev-start\.ts\|dev-local\.ts" README.md || echo "CLEAN"
      2. Check output is "CLEAN"
    Expected Result: Zero matches
    Evidence: .sisyphus/evidence/task-4-readme-refs.txt
  ```

  **Commit**: NO (groups with T2, T3, T5, T6)

- [x] 5. Update scripts referencing `dev:start` or `dev:local`

  **What to do**:
  - `scripts/register-project.ts:294` — Change `pnpm dev:start` to `pnpm dev`
  - `scripts/preflight-guest-messaging.ts:231` — Change `pnpm dev:local` to `pnpm dev`
  - `scripts/setup.ts:399` — Change `pnpm dev:start` to `pnpm dev`
  - `scripts/setup-two-tenants.ts:139` — Change `pnpm dev:start` to `pnpm dev`
  - `scripts/trigger-task.ts:436` — Change `pnpm dev:start` to `pnpm dev`
  - `scripts/trigger-task.ts:563` — Change `pnpm dev:start` to `pnpm dev`

  **Must NOT do**:
  - Do NOT change any logic in these scripts
  - Do NOT modify error handling patterns
  - Do NOT touch `scripts/dev-e2e.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple string replacements across 5 files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T3, T4, T6)
  - **Blocks**: T7
  - **Blocked By**: T1

  **References**:
  - `scripts/register-project.ts:294` — Error message referencing dev:start
  - `scripts/preflight-guest-messaging.ts:231` — Error message referencing dev:local
  - `scripts/setup.ts:399` — Post-setup instructions
  - `scripts/setup-two-tenants.ts:139` — Error message referencing dev:start
  - `scripts/trigger-task.ts:436,563` — Error messages referencing dev:start

  **WHY Each Reference Matters**:
  - These are user-facing error messages — when a developer hits an error, they'll be told to run a command that doesn't exist

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stale references in scripts/
    Tool: Bash
    Preconditions: All 5 scripts edited
    Steps:
      1. Run: grep -rn "dev:start\|dev:local" scripts/ --include="*.ts" | grep -v "dev-start.ts" | grep -v "dev-local.ts" | grep -v "dev.ts" | grep -v "dev-e2e.ts" || echo "CLEAN"
      2. Check output is "CLEAN"
    Expected Result: Zero matches in non-dev scripts
    Evidence: .sisyphus/evidence/task-5-scripts-refs.txt

  Scenario: Build still passes
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Check exit code is 0
    Expected Result: Zero TypeScript errors
    Evidence: .sisyphus/evidence/task-5-build.txt
  ```

  **Commit**: NO (groups with T2, T3, T4, T6)

- [x] 6. Update docs files referencing `dev:start` or `dev:local`

  **What to do**:
  Replace all references in these docs files (change `dev:start` and `dev:local` to `pnpm dev`, change `dev-start.ts` and `dev-local.ts` to `dev.ts`):
  - `docs/2026-04-08-1357-project-registration-and-development-loop.md:19`
  - `docs/2026-04-16-0310-manual-employee-trigger.md:24`
  - `docs/2026-04-01-1655-phase8-e2e.md:17`
  - `docs/2026-04-01-1726-system-overview.md:72,153,154,159`
  - `docs/snapshots/2026-04-16-2149-current-system-state.md:478,551`
  - `docs/snapshots/2026-04-20-1314-current-system-state.md:499`
  - `docs/2026-04-03-1251-supabase-infrastructure.md:84,90`
  - `docs/snapshots/2026-04-29-2255-current-system-state.md:1138,1139,1214`
  - `docs/2026-05-04-2023-local-e2e-testing.md:165`
  - `docs/snapshots/2026-04-24-1452-current-system-state.md:641`
  - `docs/2026-04-01-2110-troubleshooting.md:26`
  - `docs/2026-05-02-1934-cloudflare-tunnel-and-hostfully-webhook-setup.md:67,94,97,177,273,376`
  - `docs/2026-04-07-1732-hybrid-mode-current-state.md:154,623,632`
  - `docs/testing/guest-messaging/2026-05-03-1946-00-prerequisites-and-setup.md:43,68,105,115`
  - `docs/testing/guest-messaging/2026-05-04-2346-e2e-manual-testing-guide.md:151,258,265,267,930`
  - Special case: `docs/testing/guest-messaging/2026-05-04-2346-e2e-manual-testing-guide.md:267` says "If you only need to test without Slack OAuth setup, you can use `pnpm dev:start` instead (no tunnel, no Docker build)." — Replace this with: "If you don't need the tunnel, use `pnpm dev --no-tunnel --skip-build`."

  **Must NOT do**:
  - Do NOT restructure any docs
  - Do NOT update content beyond command references
  - Do NOT delete any docs files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical find-and-replace across many files, but all trivial edits
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T2, T3, T4, T5)
  - **Blocks**: T7
  - **Blocked By**: T1

  **References**:
  - All files listed above with line numbers

  **WHY Each Reference Matters**:
  - Stale docs will send contributors to run commands that don't exist

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stale references in docs/
    Tool: Bash
    Preconditions: All docs files edited
    Steps:
      1. Run: grep -rn "dev:start\|dev:local\|dev-start\.ts\|dev-local\.ts" docs/ || echo "CLEAN"
      2. Check output is "CLEAN"
    Expected Result: Zero matches
    Failure Indicators: Any stale reference found
    Evidence: .sisyphus/evidence/task-6-docs-refs.txt
  ```

  **Commit**: NO (groups with T2, T3, T4, T5)

- [x] 7. Delete old scripts, build verification, codebase-wide sweep

  **What to do**:
  - Delete `scripts/dev-start.ts`
  - Delete `scripts/dev-local.ts`
  - Run `pnpm build` — must pass clean
  - Run codebase-wide sweep: `grep -rn "dev:start\|dev:local\|dev-start\.ts\|dev-local\.ts" . --include="*.ts" --include="*.md" --include="*.json" | grep -v node_modules | grep -v .git | grep -v ".sisyphus/"` — must return empty
  - If any stale references found, fix them

  **Must NOT do**:
  - Do NOT delete `scripts/dev-e2e.ts`
  - Do NOT delete `scripts/dev.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + verification commands
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: T2, T3, T4, T5, T6

  **References**:
  - `scripts/dev-start.ts` — file to delete
  - `scripts/dev-local.ts` — file to delete

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Old scripts deleted
    Tool: Bash
    Steps:
      1. Run: ls scripts/dev-start.ts 2>&1
      2. Check output contains "No such file"
      3. Run: ls scripts/dev-local.ts 2>&1
      4. Check output contains "No such file"
      5. Run: ls scripts/dev.ts
      6. Check exit code is 0
    Expected Result: Old scripts gone, new script exists
    Evidence: .sisyphus/evidence/task-7-files-check.txt

  Scenario: Build passes after deletion
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Check exit code is 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-7-build.txt

  Scenario: Codebase-wide sweep finds zero stale references
    Tool: Bash
    Steps:
      1. Run: grep -rn "dev:start\|dev:local\|dev-start\.ts\|dev-local\.ts" . --include="*.ts" --include="*.md" --include="*.json" | grep -v node_modules | grep -v .git | grep -v ".sisyphus/" || echo "ALL_CLEAN"
      2. Check output is "ALL_CLEAN"
    Expected Result: Zero stale references in entire codebase
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-7-sweep.txt
  ```

  **Commit**: YES
  - Message: `chore: remove legacy dev-start.ts and dev-local.ts`
  - Files: `scripts/dev-start.ts` (deleted), `scripts/dev-local.ts` (deleted)
  - Pre-commit: `pnpm build`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (run `pnpm dev --help`, grep for flag handling). For each "Must NOT Have": search codebase for forbidden patterns (aliases, refactored internals). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [5/5] | Must NOT Have [5/5] | Tasks [7/7] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build`. Review `scripts/dev.ts` for: `as any`/`@ts-ignore`, empty catches (expected in dev script), console.log patterns, unused imports. Verify flag parsing handles unknown flags correctly. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS] | Files [1 clean/0 issues] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute `pnpm dev --help` and verify output. Run `grep -r "dev:start\|dev:local" --include="*.ts" --include="*.md" --include="*.json" .` (excluding node_modules, .git) to verify zero stale references. Verify `scripts/dev-start.ts` and `scripts/dev-local.ts` no longer exist. Save evidence.
      Output: `Help [PASS] | Stale refs [0 found] | Old files [DELETED] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [7/7 compliant] | Contamination [CLEAN] | Unaccounted [CLEAN] | VERDICT: APPROVE`

- [x] N. **Notify completion** — Send Telegram notification: plan `consolidate-dev-commands` complete, all tasks done, come back to review results.

---

## Commit Strategy

| Group | Message                                                              | Files                                                                    | Pre-commit   |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------ |
| T1    | `feat(scripts): add unified dev.ts with auto-tunnel detection`       | `scripts/dev.ts`                                                         | `pnpm build` |
| T2-T6 | `refactor: replace dev:start and dev:local references with pnpm dev` | `package.json`, `AGENTS.md`, `README.md`, `scripts/*.ts`, `docs/**/*.md` | `pnpm build` |
| T7    | `chore: delete legacy dev-start.ts and dev-local.ts`                 | `scripts/dev-start.ts`, `scripts/dev-local.ts`                           | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
pnpm dev --help                    # Expected: shows --reset, --skip-build, --no-tunnel flags
pnpm build                         # Expected: exit 0
grep -r "dev:start" --include="*.ts" --include="*.md" --include="*.json" . | grep -v node_modules | grep -v .git  # Expected: no output
grep -r "dev:local" --include="*.ts" --include="*.md" --include="*.json" . | grep -v node_modules | grep -v .git  # Expected: no output
ls scripts/dev-start.ts 2>&1       # Expected: No such file
ls scripts/dev-local.ts 2>&1       # Expected: No such file
ls scripts/dev.ts 2>&1             # Expected: scripts/dev.ts
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes clean
- [ ] No stale references to dev:start or dev:local
