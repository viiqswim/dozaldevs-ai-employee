# Learnings — fix-delivery-confirmation-conflict

## [2026-05-27] Plan Start

### Root Cause

- Harness delivery check (opencode-harness.mts:758) requires `deliverySummary.delivered === true`
- `submit-output.ts` writes `{"summary":"...","classification":"..."}` — NO `delivered` key
- So when LLM correctly uses `submit-output.ts`, harness rejects it
- fix: harness check must also accept `deliverySummary.summary` (submit-output.ts format)

### Platform Convention (NEW — to be documented in AGENTS.md)

- ALL `/tmp/` contract file writes MUST go through TypeScript tools in `/tools/`
- NEVER write to `/tmp/summary.txt` via `echo`, shell redirects, or direct file writes
- Tools: `submit-output.ts` for summary, `post-message.ts` for Slack posting

### SQL Script State

- `scripts/2026-05-25-update-archetype-delivery.sql` already exists
- Lines 63-72: daily-real-estate-inspiration-2 delivery_instructions currently say:
  - Post to Slack via `--text "PASTE THE DRAFT MESSAGE HERE"` (shell quoting failure risk)
  - `echo '{"delivered":true}' > /tmp/summary.txt` (WRONG — direct write)
- Fix: use `--text-file /tmp/delivery-draft.txt` + `submit-output.ts` for confirmation

### Other archetypes in the SQL script (DO NOT TOUCH per plan scope):

- real-estate-motivation-bot-2 (line 33): also has `{"delivered":true}` direct write — out of scope
- schedule-generator-thornton (line 84): also has `{"delivered":true}` direct write — out of scope
- After harness fix, harness accepts BOTH formats, so no regression

### Key File Locations

- Harness delivery check: src/workers/opencode-harness.mts:758
- Harness submitOutputCmd (DO NOT CHANGE): src/workers/opencode-harness.mts:722
- post-message.ts parseArgs: src/worker-tools/slack/post-message.ts:9-70
- submit-output.ts --draft-file pattern: src/worker-tools/platform/submit-output.ts:53-54, 100-115
- SQL script: scripts/2026-05-25-update-archetype-delivery.sql
- AGENTS.md Key Conventions section: line 329

### Archetype IDs

- daily-real-estate-inspiration-2: 3b07ec63-207f-4f2b-a8c3-c17f08bc508f
- Tenant: 00000000-0000-0000-0000-000000000003 (VLRE)
- Trigger: POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger

## T4: AGENTS.md /tmp/ Convention (2026-05-26)

- Added new bullet to "Key Conventions" section documenting that `/tmp/summary.txt` and `/tmp/approval-message.json` must be written exclusively via TypeScript tools in `/tools/` (e.g., `submit-output.ts`)
- Convention explicitly forbids `echo`, shell redirects, and any non-tool direct writes
- Root cause of the original bug: this convention was undocumented, so delivery_instructions used `echo '{"delivered":true}' > /tmp/summary.txt` which bypassed the tool contract
- Evidence saved to `.sisyphus/evidence/task-4-agents-md-convention.txt` (gitignored dir — local only)
- Committed as: `docs(agents): document /tmp/ file convention — tools only, no direct writes`

## T3: SQL delivery_instructions fix (2026-05-26)

- Updated `scripts/2026-05-25-update-archetype-delivery.sql` for archetype `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
- Old delivery_instructions: used `--text "PASTE THE DRAFT MESSAGE HERE"` (shell quoting risk) + `echo '{"delivered":true}' > /tmp/summary.txt` (platform violation)
- New delivery_instructions: uses `--text-file /tmp/delivery-draft.txt` + `submit-output.ts --summary ... --classification NO_ACTION_NEEDED`
- SQL applied: `UPDATE 1` — DB confirmed has submit-output.ts, --text-file, no echo
- Evidence file: `.sisyphus/evidence/task-3-delivery-instructions-updated.txt` (gitignored — local only)
- Committed as: `fix(archetype): update inspiration-2 delivery_instructions to use submit-output.ts`
- Note: .sisyphus/evidence/ is gitignored — evidence files are local only

## Task 6: 10-Run Sequential Validation (2026-05-26)

**Result: 10/10 PASSED** — all tasks reached `Done` with `Delivering → Done, actor='machine'`

### Task IDs:
1. `9b98d5f5-0171-48b1-8acd-5d42e631b7db` → Done
2. `5c291bff-3343-4739-8a92-86333b2e17a1` → Done
3. `29195f5f-8b4a-4401-8842-4d3964c2e38e` → Done
4. `5b76aae0-573d-40d2-8a89-c22303f39698` → Done
5. `b64ab8a5-4887-438c-a825-4da7e745b462` → Done
6. `bffb1c88-b601-41bf-b890-a25558a1c1c6` → Done
7. `180d2af9-45ad-4bc8-b2b1-abf235a61bdd` → Done
8. `d0486d78-d84a-4a80-8cb5-b5a7e01db645` → Done
9. `c84d184a-0472-4ba5-bea8-89b82880eff9` → Done
10. `4e30c9f6-bd22-4a79-9f03-c6df07c7300b` → Done

### Performance:
- Total: ~15m 43s for 10 sequential runs
- Average: ~94s per run
- Typical state trace: `Executing → Submitting → Delivering → Done` (2-5 polls at 20s each)

### Fix is solid:
- Zero failures across 10 consecutive runs
- No "Delivery not confirmed" errors
- No race conditions or flakiness
- delivery_instructions with `--text-file` pattern works reliably
- `submit-output.ts` properly writes `/tmp/summary.txt` and `/tmp/approval-message.json`
