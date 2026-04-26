# VLRE Channel Config: Env Vars → Database Migration

## TL;DR

> **Quick Summary**: Migrate VLRE tenant's channel configuration from dead `.env` variables to the database (`tenants.config.summary`), matching the working DozalDevs pattern. Rewrite VLRE archetype instructions with hardcoded channel IDs and the mandatory output contract.
>
> **Deliverables**:
>
> - VLRE `config.summary` populated in seed data with real channel IDs
> - VLRE archetype instructions rewritten with hardcoded channels + output contract
> - Dead `SUMMARIZER_INSTRUCTIONS` constant removed from seed
> - `DAILY_SUMMARY_CHANNELS` and `SUMMARY_TARGET_CHANNEL` removed from `.env` and `.env.example`
> - `AGENTS.md` and canonical docs updated to reflect DB-driven pattern for all tenants
>
> **Estimated Effort**: Quick–Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → F1–F4 → user okay

---

## Context

### Original Request

VLRE tenant is still managing channel configuration via `.env` file environment variables, while DozalDevs already stores everything in the database (`tenants.config.summary`). The inconsistency needs to be resolved — all configuration should live in the DB.

### Interview Summary

**Key Discussions**:

- VLRE's `.env` vars (`DAILY_SUMMARY_CHANNELS`, `SUMMARY_TARGET_CHANNEL`) are NOT in `PLATFORM_ENV_WHITELIST` — they never reach Fly.io machines. VLRE summarizer is broken for remote execution.
- `loadTenantEnv()` already handles DB → env var mapping correctly. No code changes needed to the loader or lifecycle.
- VLRE archetype instructions will switch from env-var references to hardcoded channel IDs, matching DozalDevs pattern.
- VLRE publish channel = target channel (`C0960S2Q8RL`) — confirmed correct.

**Research Findings**:

- `loadTenantEnv()` (tenant-env-loader.ts): 3-layer build — platform whitelist → tenant secrets → DB config.summary → env vars. Channel vars only emitted if DB config is non-empty.
- `employee-lifecycle.ts`: Reads channels from `tenantEnvForApproval` (output of `loadTenantEnv`), not from `process.env`.
- VLRE seed has `config: { summary: { channel_ids: [], target_channel: null } }` — empty. DozalDevs has full config populated.
- VLRE `update` block in seed only updates `name` and `status`, NOT `config`. Must add config to both create AND update blocks.
- `SUMMARIZER_INSTRUCTIONS` constant in seed.ts is used only by VLRE archetype — becomes dead code after migration.

### Metis Review

**Identified Gaps** (addressed):

- **Seed idempotency**: VLRE `update` block must include `config` — otherwise re-running seed on existing DB silently leaves VLRE broken. → Added to Task 1 acceptance criteria.
- **Dead constant**: `SUMMARIZER_INSTRUCTIONS` becomes unused after migration. → Task 1 explicitly deletes it.
- **`publish_channel` missing from seed**: Current VLRE seed has no `publish_channel` field. → Task 1 adds it explicitly (`C0960S2Q8RL`).
- **VLRE "no messages" fallback**: DozalDevs has explicit Spanish fallback text, VLRE doesn't. → Task 1 includes fallback text in new instructions.
- **`--lookback-hours` consistency**: DozalDevs omits `--lookback-hours` (relies on 24h default). → VLRE instructions will match this pattern for consistency.
- **Historical docs scope**: `2026-04-16-2149-current-system-state.md` and `2026-04-15-1910-summarizer-overview.md` are historical — update only canonical docs.

---

## Work Objectives

### Core Objective

Unify all tenant channel configuration to be database-driven, eliminating the `.env` file dependency for VLRE and matching the proven DozalDevs pattern.

### Concrete Deliverables

- Updated `prisma/seed.ts` — VLRE tenant config + archetype instructions + dead constant removed
- Updated `.env` — channel vars removed
- Updated `.env.example` — channel var documentation removed
- Updated `AGENTS.md` — reflects unified DB-driven pattern
- Updated `docs/2026-04-20-1314-current-system-state.md` — tenant config table corrected
- Updated `docs/2026-04-16-1655-multi-tenancy-guide.md` — env var references removed

### Definition of Done

- [ ] `pnpm prisma db seed` succeeds
- [ ] `psql` query shows VLRE `config.summary` with all three channel fields populated
- [ ] `psql` query shows VLRE archetype instructions with hardcoded channels, no env var references
- [ ] `grep` confirms zero references to `DAILY_SUMMARY_CHANNELS` or `SUMMARY_TARGET_CHANNEL` in `.env` and `.env.example`
- [ ] `pnpm test -- --run` passes with 0 new failures
- [ ] `pnpm build` exits cleanly

### Must Have

- VLRE `config.summary.channel_ids`: `['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL']`
- VLRE `config.summary.target_channel`: `'C0960S2Q8RL'`
- VLRE `config.summary.publish_channel`: `'C0960S2Q8RL'`
- VLRE archetype instructions with hardcoded channel IDs (no env var names)
- VLRE archetype instructions with `/tmp/summary.txt` + `/tmp/approval-message.json` output contract
- `SUMMARIZER_INSTRUCTIONS` generic constant deleted from seed.ts
- `DAILY_SUMMARY_CHANNELS` and `SUMMARY_TARGET_CHANNEL` removed from `.env` and `.env.example`

### Must NOT Have (Guardrails)

- **Do NOT touch `src/gateway/services/tenant-env-loader.ts`** — the infrastructure is correct as-is
- **Do NOT touch `src/inngest/employee-lifecycle.ts`** — reads from `loadTenantEnv` output, works correctly
- **Do NOT touch `tests/gateway/services/tenant-env-loader.test.ts`** or `tests/integration/multi-tenancy.test.ts` — existing tests cover the behavior
- **Do NOT touch DozalDevs archetype instructions or DozalDevs tenant config** — already working correctly
- **Do NOT remove `FLY_SUMMARIZER_APP` or `SUMMARIZER_VM_SIZE` from `.env.example`** — these are platform vars, still needed
- **Do NOT remove the `SLACK_BOT_TOKEN` deprecation comment from `.env.example`** — that's about OAuth migration, not this task
- **Do NOT update historical docs** (`2026-04-16-2149-current-system-state.md`, `2026-04-15-1910-summarizer-overview.md`) — leave as historical artifacts
- **Do NOT add `--lookback-hours` to VLRE instructions** — DozalDevs omits it (relies on 24h default), stay consistent

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None needed — no code changes to test. Existing tests verify `loadTenantEnv` behavior.
- **Framework**: Vitest (existing)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Seed verification**: Use Bash (psql) — query DB after seed, assert field values
- **File content verification**: Use Bash (grep) — assert presence/absence of strings
- **Build/test verification**: Use Bash — run `pnpm test` and `pnpm build`, assert exit codes

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent changes):
├── Task 1: Update prisma/seed.ts (VLRE config + instructions + cleanup) [quick]
├── Task 2: Clean up .env and .env.example (remove dead channel vars) [quick]
└── Task 3: Update AGENTS.md (3 locations) [quick]

Wave 2 (After Wave 1 — depends on knowing final state):
├── Task 4: Update docs/2026-04-20-1314-current-system-state.md [quick]
└── Task 5: Update docs/2026-04-16-1655-multi-tenancy-guide.md [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks      | Wave  |
| ----- | ---------- | ----------- | ----- |
| 1     | —          | 4, 5, F1–F4 | 1     |
| 2     | —          | F1–F4       | 1     |
| 3     | —          | 4, 5        | 1     |
| 4     | 1, 3       | F1–F4       | 2     |
| 5     | 1, 3       | F1–F4       | 2     |
| F1–F4 | 1–5        | user okay   | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2** — T4 → `quick`, T5 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Update `prisma/seed.ts` — VLRE tenant config, archetype instructions, dead constant cleanup

  **What to do**:
  1. **Delete the `SUMMARIZER_INSTRUCTIONS` constant** (the generic env-var-referencing one, currently at ~line 143). It is used ONLY by the VLRE archetype and becomes dead code after this migration.
  2. **Create a new `VLRE_SUMMARIZER_INSTRUCTIONS` constant** with hardcoded channel IDs. Use the DozalDevs constant (`DOZALDEVS_SUMMARIZER_INSTRUCTIONS`, ~lines 152–165) as the exact template. Adapt for VLRE's channels:
     - Read from: `C0AMGJQN05S`, `C0ANH9J91NC`, `C0960S2Q8RL` (pass all three comma-separated to `--channels`)
     - Approval channel: `C0960S2Q8RL`
     - Publish channel: `C0960S2Q8RL`
     - Include the "no messages" Spanish fallback text (adapt DozalDevs's `"Sin actividad en..."` for VLRE's channels)
     - Include the mandatory output contract: `CRITICAL — You MUST write the summary content to a file: write the full summary text to /tmp/summary.txt`
     - Include the `NODE_NO_WARNINGS=1` prefix on `node /tools/slack/post-message.js` commands
     - Include the `> /tmp/approval-message.json` stdout redirect
     - Include the `DELIVERY_MODE` check for publishing approved content
     - Do NOT include `--lookback-hours` (DozalDevs omits it, rely on 24h default)
  3. **Update VLRE tenant upsert** — add `config` to BOTH the `create` AND `update` blocks:
     ```
     config: {
       summary: {
         channel_ids: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL'],
         target_channel: 'C0960S2Q8RL',
         publish_channel: 'C0960S2Q8RL',
       },
     },
     ```
  4. **Update VLRE archetype upsert** — change `instructions` from `SUMMARIZER_INSTRUCTIONS` to `VLRE_SUMMARIZER_INSTRUCTIONS` in BOTH the `create` AND `update` blocks.

  **Must NOT do**:
  - Do NOT modify DozalDevs tenant config or archetype instructions
  - Do NOT modify `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` or `PAPI_CHULO_SYSTEM_PROMPT`
  - Do NOT add `--lookback-hours` flag (stay consistent with DozalDevs)
  - Do NOT change any other upsert blocks (Platform tenant, DozalDevs tenant, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file edit with clear before/after. Templated from existing DozalDevs pattern.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None — this is a straightforward seed data update

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5 (docs depend on knowing final seed state)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `prisma/seed.ts:152-165` — `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` constant: use this as the EXACT template for the new `VLRE_SUMMARIZER_INSTRUCTIONS`. Copy structure, adapt channel IDs.
  - `prisma/seed.ts:36-41` — DozalDevs tenant `config.summary` object: use this as the template for VLRE's config structure (all three fields: `channel_ids`, `target_channel`, `publish_channel`).
  - `prisma/seed.ts:168-175` — DozalDevs archetype upsert: shows how `instructions` is set in both `create` and `update` blocks.

  **API/Type References**:
  - `prisma/seed.ts:143-150` — Current `SUMMARIZER_INSTRUCTIONS` constant to DELETE (the generic env-var one).
  - `prisma/seed.ts:57-68` — Current VLRE tenant upsert: shows the `create` block with empty config and `update` block missing config entirely.
  - `prisma/seed.ts:210-225` — Current VLRE archetype upsert: shows where `instructions: SUMMARIZER_INSTRUCTIONS` is referenced.

  **WHY Each Reference Matters**:
  - DozalDevs constant is the proven, working template — copy its structure exactly, only change channel IDs
  - DozalDevs config structure shows the required shape including `publish_channel` (which VLRE seed currently omits)
  - DozalDevs archetype upsert shows the pattern of setting `instructions` in both `create` AND `update` — critical for seed idempotency

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: VLRE tenant config is correctly seeded (happy path)
    Tool: Bash (psql)
    Preconditions: Docker Compose running, database accessible at localhost:54322
    Steps:
      1. Run: pnpm prisma db seed
      2. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT config->'summary' FROM tenants WHERE id='00000000-0000-0000-0000-000000000003';"
      3. Assert JSON output contains: "channel_ids": ["C0AMGJQN05S", "C0ANH9J91NC", "C0960S2Q8RL"]
      4. Assert JSON output contains: "target_channel": "C0960S2Q8RL"
      5. Assert JSON output contains: "publish_channel": "C0960S2Q8RL"
    Expected Result: All three fields present with correct values
    Failure Indicators: Empty channel_ids array, null target_channel, missing publish_channel
    Evidence: .sisyphus/evidence/task-1-vlre-config-seeded.txt

  Scenario: VLRE archetype instructions are hardcoded (no env vars)
    Tool: Bash (psql)
    Preconditions: Seed has been run
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT instructions FROM archetypes WHERE id='00000000-0000-0000-0000-000000000013';"
      2. Assert output contains: C0AMGJQN05S
      3. Assert output contains: C0ANH9J91NC
      4. Assert output contains: C0960S2Q8RL
      5. Assert output contains: /tmp/summary.txt
      6. Assert output contains: /tmp/approval-message.json
      7. Assert output does NOT contain: DAILY_SUMMARY_CHANNELS
      8. Assert output does NOT contain: SUMMARY_TARGET_CHANNEL
      9. Assert output does NOT contain: SUMMARY_PUBLISH_CHANNEL
    Expected Result: Hardcoded channel IDs present, no env var references
    Failure Indicators: Any env var name found in instructions text
    Evidence: .sisyphus/evidence/task-1-vlre-instructions-verified.txt

  Scenario: Dead constant removed from seed.ts
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep -n "^const SUMMARIZER_INSTRUCTIONS" prisma/seed.ts
      2. Assert: zero matches (exit code 1)
      3. Run: grep -c "VLRE_SUMMARIZER_INSTRUCTIONS" prisma/seed.ts
      4. Assert: output >= 2 (one definition, at least one usage)
    Expected Result: Old generic constant gone, new VLRE constant exists
    Failure Indicators: Old constant still present, or new constant missing
    Evidence: .sisyphus/evidence/task-1-constant-cleanup.txt

  Scenario: Seed is idempotent (re-run produces same result)
    Tool: Bash (psql)
    Preconditions: Seed has been run once
    Steps:
      1. Run: pnpm prisma db seed (second time)
      2. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT config->'summary' FROM tenants WHERE id='00000000-0000-0000-0000-000000000003';"
      3. Assert same output as first run
    Expected Result: Config unchanged after second seed run
    Failure Indicators: Config reverts to empty, or seed errors
    Evidence: .sisyphus/evidence/task-1-idempotent-seed.txt
  ```

  **Commit**: YES (groups into single atomic commit with all tasks)
  - Message: `fix(vlre): migrate channel config from env vars to database`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

- [x] 2. Remove dead env vars from `.env` and `.env.example`

  **What to do**:
  1. **Remove from `.env`**: Delete the lines containing `DAILY_SUMMARY_CHANNELS=...` and `SUMMARY_TARGET_CHANNEL=...` and any associated comments directly above them.
  2. **Remove from `.env.example`**: Delete the documentation block for `DAILY_SUMMARY_CHANNELS` (the comment lines + the empty variable line) and `SUMMARY_TARGET_CHANNEL` (comment lines + empty variable line). These are around lines 131–138.
  3. **Do NOT remove** `FLY_SUMMARIZER_APP`, `SUMMARIZER_VM_SIZE`, `SLACK_SIGNING_SECRET`, or any other env vars — only the two channel config vars.
  4. **Do NOT remove** the `SLACK_BOT_TOKEN` deprecation comment (it references "VLRE migration" but means the OAuth migration, not this task).

  **Must NOT do**:
  - Do NOT remove `FLY_SUMMARIZER_APP` or `SUMMARIZER_VM_SIZE` from `.env.example`
  - Do NOT remove `SLACK_BOT_TOKEN` deprecation comment
  - Do NOT remove `SLACK_CHANNEL_ID` or `SLACK_WEBHOOK_URL` (out of scope, even if they look dead)
  - Do NOT modify any other env vars

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple line deletion from two config files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: F1–F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.env.example:131-138` — The `DAILY_SUMMARY_CHANNELS` and `SUMMARY_TARGET_CHANNEL` documentation blocks to remove
  - `.env` — The live values to remove (search for `DAILY_SUMMARY_CHANNELS` and `SUMMARY_TARGET_CHANNEL`)

  **WHY Each Reference Matters**:
  - `.env.example` is the developer documentation for env vars — removing these entries prevents confusion about where channel config lives
  - `.env` has live values that are dead code (never forwarded to Fly.io machines) — removing prevents misleading troubleshooting

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dead env vars removed from .env.example
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep -c "DAILY_SUMMARY_CHANNELS" .env.example
      2. Assert: output is 0
      3. Run: grep -c "SUMMARY_TARGET_CHANNEL" .env.example
      4. Assert: output is 0
      5. Run: grep "FLY_SUMMARIZER_APP" .env.example
      6. Assert: line exists (not accidentally removed)
      7. Run: grep "SUMMARIZER_VM_SIZE" .env.example
      8. Assert: line exists (not accidentally removed)
    Expected Result: Channel vars gone, platform vars preserved
    Failure Indicators: Channel vars still present, or platform vars accidentally removed
    Evidence: .sisyphus/evidence/task-2-env-example-cleaned.txt

  Scenario: Dead env vars removed from .env
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep -c "DAILY_SUMMARY_CHANNELS" .env
      2. Assert: output is 0
      3. Run: grep -c "SUMMARY_TARGET_CHANNEL" .env
      4. Assert: output is 0
    Expected Result: No references to dead channel vars
    Failure Indicators: Vars still present in .env
    Evidence: .sisyphus/evidence/task-2-env-cleaned.txt
  ```

  **Commit**: YES (groups into single atomic commit)
  - Message: `fix(vlre): migrate channel config from env vars to database`
  - Files: `.env`, `.env.example`
  - Pre-commit: `pnpm test -- --run && pnpm build`

- [x] 3. Update `AGENTS.md` — unify tenant configuration documentation

  **What to do**:
  Update three specific sections of `AGENTS.md` to reflect that ALL tenants now use DB-driven channel configuration:
  1. **"Summarizer — Per-Tenant Channel Configuration" section** (~line 204): Rewrite the VLRE subsection. Currently says "Generic instructions reading from env vars (`DAILY_SUMMARY_CHANNELS`, `SUMMARY_TARGET_CHANNEL`)". Update to document the hardcoded channel IDs pattern matching DozalDevs, listing the actual VLRE channels:
     - Read from: `C0AMGJQN05S`, `C0ANH9J91NC`, `C0960S2Q8RL`
     - Post approval summary + buttons to: `C0960S2Q8RL`
     - Post confirmation (publish) to: `C0960S2Q8RL`
     - `tenant.config.summary.target_channel`: `C0960S2Q8RL`
     - Also update the VLRE "Pattern" line from "Generic instructions reading from env vars" to "Hardcoded channel IDs in archetype instructions (not env vars)"

  2. **"Per-Tenant Slack Token Architecture" section** (~line 168): The `loadTenantEnv()` mapping table mentions `tenant.config.summary.channel_ids` → `DAILY_SUMMARY_CHANNELS`. This mapping is still technically correct (the code still does this), but the surrounding text should clarify that channel IDs are now stored in DB config for ALL tenants. Remove any implication that `.env` is involved for channel config.

  3. **"Environment Variables" section** (~line 321): Remove `DAILY_SUMMARY_CHANNELS` and `SUMMARY_TARGET_CHANNEL` from the "Summarizer-specific vars" block. These are no longer env vars — they're DB config. Keep `SLACK_SIGNING_SECRET`, `FLY_WORKER_APP`, and `SUMMARIZER_VM_SIZE`.

  4. **"Tenants" table** (~line 76): Update the table. Currently shows VLRE with `T06KFDGLHS6` — this is correct. But if this table references the env-var pattern, update it. Also verify the table in the user's original request (the one with "Read Channels", "Approval Channel", etc.) is reflected — update all VLRE rows from `env: DAILY_SUMMARY_CHANNELS` to the actual channel IDs.

  **Must NOT do**:
  - Do NOT change DozalDevs documentation (it's already correct)
  - Do NOT remove `loadTenantEnv()` documentation (the mapping code is unchanged, just the source of truth moved)
  - Do NOT remove `SLACK_SIGNING_SECRET`, `FLY_WORKER_APP`, or `SUMMARIZER_VM_SIZE` from env var docs

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation-only edits to a markdown file, multiple targeted string replacements
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5 (docs should be consistent with AGENTS.md)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `AGENTS.md` — "Summarizer — Per-Tenant Channel Configuration" section: DozalDevs subsection shows the target pattern for VLRE
  - `AGENTS.md` — "Per-Tenant Slack Token Architecture" section: shows current `loadTenantEnv` documentation

  **API/Type References**:
  - `AGENTS.md` — "Environment Variables" section: current list of summarizer-specific vars

  **WHY Each Reference Matters**:
  - DozalDevs subsection is the template for how VLRE should be documented
  - `loadTenantEnv` section needs minor clarification that env vars come from DB, not `.env`
  - Env var list must be pruned to avoid developers setting dead vars

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md no longer references env-var pattern for VLRE
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep -n "Generic instructions reading from env vars" AGENTS.md
      2. Assert: zero matches
      3. Run: grep -n "env: \`DAILY_SUMMARY_CHANNELS\`" AGENTS.md
      4. Assert: zero matches
      5. Run: grep -n "env: \`SUMMARY_TARGET_CHANNEL\`" AGENTS.md
      6. Assert: zero matches
      7. Run: grep -n "env: \`SUMMARY_PUBLISH_CHANNEL\`" AGENTS.md
      8. Assert: zero matches
    Expected Result: No env-var pattern references for VLRE remain
    Failure Indicators: Any env-var pattern references found
    Evidence: .sisyphus/evidence/task-3-agents-md-cleaned.txt

  Scenario: AGENTS.md documents VLRE channel IDs correctly
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep "C0AMGJQN05S" AGENTS.md
      2. Assert: at least one match (VLRE read channel documented)
      3. Run: grep "C0ANH9J91NC" AGENTS.md
      4. Assert: at least one match
      5. Run: grep "C0960S2Q8RL" AGENTS.md
      6. Assert: at least one match (VLRE target/publish channel documented)
    Expected Result: All three VLRE channel IDs present in AGENTS.md
    Failure Indicators: Any VLRE channel ID missing from docs
    Evidence: .sisyphus/evidence/task-3-agents-md-channels.txt

  Scenario: Summarizer env vars section no longer lists channel vars
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep -A1 "Summarizer-specific vars" AGENTS.md | head -20
      2. Assert: does NOT contain DAILY_SUMMARY_CHANNELS
      3. Assert: does NOT contain SUMMARY_TARGET_CHANNEL
      4. Assert: DOES contain SLACK_SIGNING_SECRET
      5. Assert: DOES contain FLY_WORKER_APP or FLY_SUMMARIZER_APP
    Expected Result: Channel vars removed, platform vars preserved
    Failure Indicators: Channel vars still listed, or platform vars removed
    Evidence: .sisyphus/evidence/task-3-env-vars-section.txt
  ```

  **Commit**: YES (groups into single atomic commit)
  - Message: `fix(vlre): migrate channel config from env vars to database`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm test -- --run && pnpm build`

- [x] 4. Update `docs/2026-04-20-1314-current-system-state.md` — tenant config table

  **What to do**:
  1. Find the Tenant Configuration table (the one with columns like "Read Channels", "Approval Channel", "Publish Channel", "Instructions Pattern"). Update the VLRE column:
     - Read Channels: Change from `env: DAILY_SUMMARY_CHANNELS` to `C0AMGJQN05S, C0ANH9J91NC, C0960S2Q8RL`
     - Approval Channel: Change from `env: SUMMARY_TARGET_CHANNEL` to `C0960S2Q8RL`
     - Publish Channel: Change from `env: SUMMARY_PUBLISH_CHANNEL` to `C0960S2Q8RL`
     - Instructions Pattern: Change from `Generic (env vars)` to `Hardcoded channel IDs + mandatory file output`
  2. If there's a "Platform" tenant column that also references env vars, update it consistently — but only if it exists and matches the same pattern.
  3. Search for any other references to `DAILY_SUMMARY_CHANNELS` or `SUMMARY_TARGET_CHANNEL` in this doc and update them to reflect the DB-driven pattern.

  **Must NOT do**:
  - Do NOT change the DozalDevs column (it's already correct)
  - Do NOT restructure the table — just update the VLRE values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted edits to a markdown table in a single doc file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: F1–F4
  - **Blocked By**: Tasks 1, 3 (should be consistent with seed and AGENTS.md)

  **References**:

  **Pattern References**:
  - `docs/2026-04-20-1314-current-system-state.md` — Tenant Configuration table: find via searching for "Read Channels" or "Instructions Pattern"
  - `AGENTS.md` — "Summarizer — Per-Tenant Channel Configuration" section: use as source of truth for what the doc should say (after Task 3 updates it)

  **WHY Each Reference Matters**:
  - This is the canonical "current system state" doc — must reflect reality after migration
  - AGENTS.md (post-Task 3) is the source of truth to copy from

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Current system state doc reflects DB-driven VLRE config
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep "env: \`DAILY_SUMMARY_CHANNELS\`" docs/2026-04-20-1314-current-system-state.md
      2. Assert: zero matches
      3. Run: grep "env: \`SUMMARY_TARGET_CHANNEL\`" docs/2026-04-20-1314-current-system-state.md
      4. Assert: zero matches
      5. Run: grep "C0960S2Q8RL" docs/2026-04-20-1314-current-system-state.md
      6. Assert: at least one match (VLRE channel documented)
      7. Run: grep "Generic (env vars)" docs/2026-04-20-1314-current-system-state.md
      8. Assert: zero matches (VLRE pattern updated)
    Expected Result: All env-var references replaced with actual channel IDs
    Failure Indicators: Old env-var references remain
    Evidence: .sisyphus/evidence/task-4-system-state-doc.txt
  ```

  **Commit**: YES (groups into single atomic commit)
  - Message: `fix(vlre): migrate channel config from env vars to database`
  - Files: `docs/2026-04-20-1314-current-system-state.md`
  - Pre-commit: `pnpm test -- --run && pnpm build`

- [x] 5. Update `docs/2026-04-16-1655-multi-tenancy-guide.md` — remove env var channel config references

  **What to do**:
  1. Find references to `DAILY_SUMMARY_CHANNELS` and `SUMMARY_TARGET_CHANNEL` as the channel configuration mechanism (~line 161–162). Update to document the DB-driven pattern.
  2. If there's a section explaining "how to configure channels for a new tenant" that says "set env vars", update it to say "populate `tenants.config.summary` in the database via seed or admin API".
  3. Ensure any tenant setup instructions reflect that channel config lives in the DB, not `.env`.

  **Must NOT do**:
  - Do NOT restructure the guide
  - Do NOT update sections about Slack OAuth (different mechanism, still correct)
  - Do NOT update historical docs (`2026-04-16-2149-current-system-state.md`, `2026-04-15-1910-summarizer-overview.md`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted edits to a markdown file, updating references
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: F1–F4
  - **Blocked By**: Tasks 1, 3 (should be consistent with seed and AGENTS.md)

  **References**:

  **Pattern References**:
  - `docs/2026-04-16-1655-multi-tenancy-guide.md:161-162` — Current env var references to update
  - `AGENTS.md` — "Summarizer — Per-Tenant Channel Configuration" section (post-Task 3): use as source of truth

  **WHY Each Reference Matters**:
  - This is the multi-tenancy setup guide — incorrect channel config instructions would lead developers to use the old `.env` pattern
  - AGENTS.md is the master reference after Task 3

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Multi-tenancy guide reflects DB-driven channel config
    Tool: Bash (grep)
    Preconditions: Task edits complete
    Steps:
      1. Run: grep -c "DAILY_SUMMARY_CHANNELS" docs/2026-04-16-1655-multi-tenancy-guide.md
      2. Assert: output is 0 (or only appears in "historical" context, not as current instructions)
      3. Run: grep -c "SUMMARY_TARGET_CHANNEL" docs/2026-04-16-1655-multi-tenancy-guide.md
      4. Assert: output is 0 (or only in historical context)
    Expected Result: No current-state references to env var channel config
    Failure Indicators: Guide still instructs developers to set channel env vars
    Evidence: .sisyphus/evidence/task-5-multi-tenancy-guide.txt
  ```

  **Commit**: YES (groups into single atomic commit)
  - Message: `fix(vlre): migrate channel config from env vars to database`
  - Files: `docs/2026-04-16-1655-multi-tenancy-guide.md`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (query DB, grep files). For each "Must NOT Have": search codebase for forbidden changes — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: stale references to old env var pattern, inconsistencies between seed data and documentation, commented-out code, typos in channel IDs.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Run `pnpm prisma db seed`. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Verify cross-task integration (seed + docs + env files all consistent). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit     | Message                                                       | Files                                                                                                                                                | Pre-commit                         |
| ---------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1 (atomic) | `fix(vlre): migrate channel config from env vars to database` | `prisma/seed.ts`, `.env`, `.env.example`, `AGENTS.md`, `docs/2026-04-20-1314-current-system-state.md`, `docs/2026-04-16-1655-multi-tenancy-guide.md` | `pnpm test -- --run && pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
# Seed runs cleanly
pnpm prisma db seed  # Expected: no errors

# VLRE config is populated
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT config->'summary' FROM tenants WHERE id='00000000-0000-0000-0000-000000000003';"
# Expected: {"channel_ids": ["C0AMGJQN05S", "C0ANH9J91NC", "C0960S2Q8RL"], "target_channel": "C0960S2Q8RL", "publish_channel": "C0960S2Q8RL"}

# VLRE archetype has hardcoded channels
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT instructions FROM archetypes WHERE id='00000000-0000-0000-0000-000000000013';"
# Expected: contains C0AMGJQN05S, C0ANH9J91NC, C0960S2Q8RL, /tmp/summary.txt, /tmp/approval-message.json
# Must NOT contain: DAILY_SUMMARY_CHANNELS, SUMMARY_TARGET_CHANNEL, SUMMARY_PUBLISH_CHANNEL

# Dead env vars removed
grep -c "DAILY_SUMMARY_CHANNELS\|SUMMARY_TARGET_CHANNEL" .env.example  # Expected: 0
grep -c "DAILY_SUMMARY_CHANNELS\|SUMMARY_TARGET_CHANNEL" .env  # Expected: 0

# No old generic constant in seed
grep -c "^const SUMMARIZER_INSTRUCTIONS" prisma/seed.ts  # Expected: 0

# Tests pass
pnpm test -- --run  # Expected: 515+ passing, 0 new failures

# Build clean
pnpm build  # Expected: exit code 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Seed re-runs idempotently (run twice, same result)
