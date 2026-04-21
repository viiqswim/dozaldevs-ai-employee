# Update Current System State Doc — Accuracy Fixes

## TL;DR

> **Quick Summary**: Fix 4 factual inaccuracies discovered by a 5-agent parallel audit of `docs/2026-04-20-1314-current-system-state.md` against the actual codebase.
>
> **Deliverables**:
>
> - Updated `docs/2026-04-20-1314-current-system-state.md` with all corrections applied
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single file, sequential edits
> **Critical Path**: One task

---

## Context

### Original Request

Update `docs/2026-04-20-1314-current-system-state.md` with the most up-to-date information by comparing every section against the actual implementation.

### Audit Summary

5 parallel explore agents audited every section of the document against the codebase:

1. **Inngest Functions** — 100% accurate. No changes needed.
2. **Gateway & Routes** — Accurate. One optional enhancement (HTTP fallback route).
3. **Worker Harness & Shell Tools** — 2 inaccuracies found.
4. **Database Schema** — Accurate. One cosmetic ordering issue.
5. **Libs, Scripts, Docker, Structure, Tenants** — 1 inaccuracy found (Dockerfile packages).

**Sections confirmed accurate (no changes needed):**

- How It Works (mermaid diagram + flow table)
- Universal Lifecycle States (state diagram + terminal states)
- Feedback Pipeline (sequence diagram + table)
- Inngest Functions (all 9 — IDs, triggers, cron expressions, files, registration count)
- Gateway and Routes (all webhook, OAuth, admin, Inngest routes)
- Slack Bolt Handlers (events, actions, idempotency, processing state, user display, task ID)
- Tenant Configuration (archetype IDs, channel IDs, patterns)
- Database Schema (19 models, 18 migrations, all columns, all constraints)
- Approved LLM Models
- Shared Libraries (all 12 files)
- Scripts (all 10 scripts + commands)
- Docker Compose Services (all 6 services, images, ports)
- Project Structure (102 test files, 10 route files, directory tree)

---

## Work Objectives

### Core Objective

Apply 4 specific factual corrections to the system state doc.

### Concrete Deliverables

- `docs/2026-04-20-1314-current-system-state.md` — updated with all fixes

### Definition of Done

- [ ] All 4 inaccuracies corrected
- [ ] No new inaccuracies introduced
- [ ] Document still renders correctly (markdown valid)

### Must Have

- Fix the output contract description (line ~185)
- Fix the Dockerfile packages description (line ~425)
- Fix the generic-harness.mts deletion claim (line ~131)
- Fix the Group C/D ordering (lines ~375-385)

### Must NOT Have (Guardrails)

- Do NOT rewrite sections that are already accurate
- Do NOT change the document structure or add new sections
- Do NOT touch the mermaid diagrams — they are verified correct
- Do NOT add verbose explanations — keep fixes minimal and precise

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: N/A
- **Automated tests**: None (documentation edit)
- **Framework**: N/A

### QA Policy

After edits, re-read the file and verify each fix was applied correctly.

---

## Execution Strategy

### Single Wave (all edits are in one file, sequential)

```
Wave 1:
└── Task 1: Apply all 4 corrections to system state doc [quick]

Wave FINAL:
└── Task F1: Re-read file, verify all 4 fixes applied correctly
```

---

## TODOs

- [ ] 1. Apply 4 accuracy corrections to system state doc

  **What to do**:

  **Fix A — Output contract (line ~185)**:
  Change: `**Output contract**: OpenCode MUST write `/tmp/summary.txt`AND`/tmp/approval-message.json`. Absence of either is a hard failure.`
  To: `**Output contract**: OpenCode SHOULD write `/tmp/summary.txt`AND`/tmp/approval-message.json`. Absence of BOTH is a hard failure — writing either file alone is sufficient. If only `/tmp/summary.txt`is missing, content defaults to`'completed'`. If only `/tmp/approval-message.json` is missing, metadata is empty.`

  **Fix B — generic-harness.mts claim (line ~131)**:
  Change the sentence: `The old `generic-harness.mts` has been fully deleted from the codebase.`
  To: `The old `generic-harness.mts`source has been deleted; stale compiled artifacts remain in`dist/` from a prior build.`

  **Fix C — Group C/D ordering (lines ~375-385)**:
  The document currently shows Group D (Forward-Compatibility) at line 375 BEFORE Group C (Multi-Tenancy) at line 379. Swap them so the order is A → B → C → D. Move the Multi-Tenancy section (Group C) to appear before the Forward-Compatibility section (Group D).

  **Fix D — Dockerfile packages (line ~425)**:
  Change: `Runtime stage installs: `git`, `curl`, `bash`, `jq`, `gh`CLI v2.45.0,`opencode-ai@1.3.3` (global).`
  To: `Runtime stage installs: `git`, `curl`, `bash`, `jq`, `ca-certificates`, `fuse-overlayfs`, `uidmap`, `gh`CLI v2.45.0,`opencode-ai@1.3.3` (global).`

  **Must NOT do**:
  - Do not rewrite any other sections
  - Do not change the mermaid diagrams
  - Do not restructure the document

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 4 small text edits, no code changes
  - **Skills**: []
    - No skills needed for markdown edits

  **Parallelization**:
  - **Can Run In Parallel**: NO (only one task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:

  **Target File**:
  - `docs/2026-04-20-1314-current-system-state.md` — The file to edit. All line numbers are approximate.

  **Evidence Sources (verified by audit agents)**:
  - `src/workers/opencode-harness.mts:190-230` — Output contract logic: lines 203-205 show summary.txt fallback to `'completed'`, lines 221-223 show approval-message.json fallback to `{}`, lines 226-230 show hard failure only when BOTH are default
  - `src/workers/generic-harness.mts` — Does NOT exist in source; `dist/workers/generic-harness.mjs` still exists as compiled artifact
  - `Dockerfile:28-32` — apt-get install line includes `ca-certificates`, `fuse-overlayfs`, `uidmap` which are omitted from the doc
  - `prisma/schema.prisma` — Schema groups: Multi-Tenancy tables (Tenant, TenantIntegration, TenantSecret) should appear as Group C before Forward-Compatibility tables

  **Acceptance Criteria**:

  ```
  Scenario: Verify all 4 fixes applied correctly
    Tool: Bash (grep)
    Steps:
      1. Read the full file docs/2026-04-20-1314-current-system-state.md
      2. Search for "Absence of BOTH" — must find this phrase (Fix A)
      3. Search for "source has been deleted" — must find this phrase (Fix B)
      4. Verify Group C (Multi-Tenancy) heading appears BEFORE Group D (Forward-Compatibility) in the file (Fix C)
      5. Search for "fuse-overlayfs" — must find this phrase (Fix D)
      6. Search for "Absence of either" — must NOT find this phrase (old text removed)
      7. Search for "fully deleted from the codebase" — must NOT find this phrase (old text removed)
    Expected Result: All 6 assertions pass
    Evidence: .sisyphus/evidence/task-1-doc-accuracy-verification.txt
  ```

  **Commit**: YES
  - Message: `docs: fix 4 factual inaccuracies in current-system-state doc`
  - Files: `docs/2026-04-20-1314-current-system-state.md`

---

## Final Verification Wave

- [ ] F1. **Read-back verification** — `quick`
      Read the entire updated file. For each of the 4 fixes, verify the old incorrect text is gone and the new correct text is present. Check that no other sections were accidentally modified. Output: `Fixes [4/4 applied] | No collateral damage | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Wave 1**: `docs: fix 4 factual inaccuracies in current-system-state doc` — `docs/2026-04-20-1314-current-system-state.md`

---

## Success Criteria

### Verification Commands

```bash
grep -c "Absence of BOTH" docs/2026-04-20-1314-current-system-state.md  # Expected: 1
grep -c "source has been deleted" docs/2026-04-20-1314-current-system-state.md  # Expected: 1
grep -c "fuse-overlayfs" docs/2026-04-20-1314-current-system-state.md  # Expected: 1
grep -c "Absence of either" docs/2026-04-20-1314-current-system-state.md  # Expected: 0
grep -c "fully deleted from the codebase" docs/2026-04-20-1314-current-system-state.md  # Expected: 0
```

### Final Checklist

- [ ] Output contract fixed (BOTH, not either)
- [ ] generic-harness.mts claim clarified
- [ ] Group C/D ordering fixed
- [ ] Dockerfile packages complete
- [ ] No other sections modified
