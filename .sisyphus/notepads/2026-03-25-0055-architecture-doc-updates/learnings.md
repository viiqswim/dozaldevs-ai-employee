## Task 2: §13 Data Model Improvements

**Pattern**: Mermaid erDiagram edits — relationships block is at top (before entity definitions), entities are defined in their own blocks. Always add new relationships in the relationships block AND the entity block.

**Insertion points used**:
- Relationship added after `TASK ||--o{ FEEDBACK : generates` (relationships block)
- `dispatch_attempts int` added inside TASK entity after `json raw_event` line
- `TASK_STATUS_LOG` entity added after `CLARIFICATION` entity (before closing backtick)
- UNIQUE constraint + dispatch_attempts prose added after Task execution cluster paragraph
- Optimistic Locking Pattern subsection added after triage_result section (before Feedback cluster)

**Verification results** (all pass):
- `grep -c "UNIQUE.*external_id"` → 1
- `grep -c "TASK_STATUS_LOG"` → 2  
- `grep -c "RETURNING id"` → ≥1
- `grep -c "dispatch_attempts"` → 2

## Task 3: §14 + §15 edits — 2026-03-25

### What was done
1. **Inngest Free Tier Capacity table** added after the Inngest Execution Limits table in §14. Inserted between the last row (`Max sleep / wait duration`) and the `---` separator before §14.1. The table covers 50K executions/month, 5 concurrent steps, 24h trace retention with an upgrade trigger callout.

2. **Structured Logging Schema subsection** (`#### Structured Logging Schema`) added after the Flow Walkthrough (point 7) in §14, immediately before `### Runtime Selection`. Contains a JSON schema block with fields: timestamp, level, taskId, step, component, message, error, metadata.

3. **Prisma row** added to the §15 Technology Stack table after `| **Database + Vectors** |`. Row content: `| **Database Migrations** | Prisma (\`prisma migrate\`) | ... |`. A note about pgvector raw SQL via `prisma db execute` was added after the full table, before "Key Changes".

### File state notes
- The file had been modified between the initial read (offset 1573) and the first edit attempt (timestamp mismatch). A re-read at offset 1666 confirmed actual line positions before edits.
- Line offsets shifted by ~17 lines from context description due to prior edits in the session.

### Verification results
- `grep -c "50,000\|50K\|5 concurrent"` → 2 ✅
- `grep -c "taskId\|structured.*log\|component.*message"` → 11 ✅
- `grep -c "Prisma\|prisma.*migrate"` → 2 ✅

### Evidence files
- `.sisyphus/evidence/task-3-inngest-limits.txt`
- `.sisyphus/evidence/task-3-logging-schema.txt`

## Task 4: Pattern C Hybrid pseudo-code rewrite (2026-03-25)

**What changed in §10:**
- MVP Lifecycle Function pseudo-code replaced with Pattern C Hybrid (two functions: `engineeringTaskLifecycle` + `engineeringTaskRedispatch`)
- Key design: single `step.waitForEvent` with `"4h10m"` timeout, `dispatch_attempts` check for auto-re-dispatch up to 3 times, 6-hour total budget noted
- Layer 1: updated event name from `engineering/execution.complete` → `engineering/task.completed`, timeout 90m → 4h10m, re-dispatch logic documented
- Layer 3: watchdog now checks Fly.io Machines API for dead machines, emits `engineering/task.failed` with `reason: 'machine_dead'`
- #1433: Marked as fixed in Inngest v1.17.2 (March 2, 2026); Supabase-first-check retained as defense-in-depth

**Grep verification counts (all pass):**
- Pattern C / Hybrid / heartbeat / watchdog: 6
- 4h / 4-hour / 240min: 8
- 6h / 6-hour total: 3
- redispatch / re-dispatch / task.redispatch: 20
- fixed v1.17 / 1433 resolved: 1

**Evidence saved:** `.sisyphus/evidence/task-4-pattern-c-verification.txt`, `.sisyphus/evidence/task-4-redispatch-flow.txt`

## Task 6: §4 + §18 re-dispatch pattern updates (2026-03-25)

### Approach
- §4 note inserted by matching the exact end of the "Note on fix loop" blockquote and the `### 4.1` header — clean sandwich edit
- §18 rows appended by matching the last existing row + `---` separator line — standard table extension pattern

### Observations
- The doc already had extensive re-dispatch prose in §10/§13 — the new §4 note ties the state machine to that existing content
- The case-sensitive grep verification for §18 risks returns 2 (not 4) because the new table rows use Title Case ("Completion event lost", "Timeout race", etc.) while grep patterns are lowercase. Still passes ≥ 2 threshold via pre-existing §10 prose matches ("timeout race condition" in code comments)
- All four new risks already had mitigation prose scattered through §8/§10/§13 — this table consolidates the risk surface in one place

### Patterns confirmed
- `grep -c "pattern\|pattern2"` counts matching LINES (not occurrences) — one line with two matches counts as 1
- Edit sandwich: oldString should span from distinct anchor above to distinct anchor below the insertion point

## Task: Section 28 Update (Nexus-Stack & dispatch-task.ts Notes)

**Completed**: 2026-03-25

### What Was Done
- Added two implementation notes to Section 28 (Deferred Capabilities) after the deferred capabilities table
- Note 1: Nexus-Stack Completion Mechanism difference (SSE/polling vs remote Inngest events)
- Note 2: dispatch-task.ts as manual fallback for watchdog failures

### Key Learnings
1. **Placement**: Notes inserted between table end (line 2680) and guiding principle blockquote (line 2686)
2. **Format**: Used blockquote format (>) to match existing documentation style
3. **Cross-references**: Both notes properly reference §8 and §10 for context
4. **Verification**: Both grep patterns confirmed presence of content

### Verification Results
- ✓ Nexus-stack completion mechanism note present (grep count: 1)
- ✓ dispatch-task.ts recovery script note present (grep count: 1)
- ✓ Section 28 structure intact (header, table, notes, guiding principle, separator)
- ✓ No markdown syntax errors

### Evidence
- Evidence file: `.sisyphus/evidence/task-8-1433-fix.txt`
- Git diff shows clean insertion with no unintended changes

## Task 7: §27 Operational Runbooks Update (2026-03-25)

### What Was Done
1. **Deployment Runbook — Initial Setup**: Added step 2.5 with `npx prisma migrate deploy` between steps 2 and 3
2. **Deployment Runbook — Ongoing**: Added "If schema changed: `npx prisma migrate deploy`" bullet before `fly deploy`
3. **Deployment Runbook — Rollback**: Added new **Rollback** subsection with `prisma migrate resolve --rolled-back` guidance
4. **Monitoring Runbook — Daily**: Added 2 new watchdog checks (task_status_log actor query + Submitting state query)
5. **Maintenance Runbook — Weekly**: Added re-dispatch pattern SQL query with dispatch_count analysis
6. **§27.5 Local Development Setup**: Added new subsection with 5 setup steps (Supabase, Inngest Dev, Gateway, Webhook tunneling, Mock machine), .env.local template, and E2E test flow

### Key Patterns
- File had been modified by prior tasks between first read (2026-03-25T06:44:07) and first edit attempt — required re-read before applying edits
- Edit sandwich pattern: anchor above + anchor below uniquely identifies insertion point
- For §27.5, replaced `Dashboards:[Debugging]...\n\n---\n\n## 28.` with new content + existing `---` + `## 28.` — preserves existing separator while adding new subsection

### Verification Results (all pass)
- `grep -c "prisma migrate"` → 6 ✅ (≥1 required)
- `grep -c "watchdog cron\|watchdog.*stale"` → 6 ✅ (≥1 required)
- `grep -c "Local Development\|inngest.*dev\|supabase start\|smee\|ngrok"` → 10 ✅ (≥3 required)

### Evidence Files
- `.sisyphus/evidence/task-7-prisma-runbook.txt`
- `.sisyphus/evidence/task-7-local-dev.txt`

## Task 9: Stale Reference Sweep (2026-03-25)

### Findings
- **Grep sweep identified 5 "90 min" references** in the architecture document
- **4 were stale** (machine timeout, risk table, credential context, incident runbook)
- **1 was acceptable** (cost estimation range — kept as-is)

### Pattern Recognition
- Stale references clustered in 3 sections: §7 (Machine Lifecycle), §18 (Risk Mitigation), §27 (Runbook)
- All references to "90-minute max task" or "90-minute hard timeout" were in the context of the OLD single-wait pattern
- Cost estimation section uses "~30-90 min" as a range, not a hard timeout — safe to keep

### Cross-Reference Consistency
- Verified §8 ↔ §10 (Supabase-first completion write mentioned in both)
- Verified §10 ↔ §13 (dispatch_attempts referenced in both)
- Verified §18 ↔ §8/§10 (risk mitigations point to correct sections)
- Verified §27 ↔ §10 (runbook references 3-layer monitoring)
- **All cross-references are consistent and accurate**

### Changes Made
1. Line 588: "90 minutes" → "4 hours (configurable per archetype)"
2. Line 2063: "90-minute hard timeout" → "4-hour hard timeout"
3. Line 2070: "90-minute max task" → "4-hour max task"
4. Line 2607: "> 90 min" → "> 4 hours"

### Verification
- Post-fix grep shows only 1 "90 min" reference (cost estimation) — PASS
- All cross-references validated — PASS
- No unrelated content modified — PASS
- Document integrity preserved — PASS

### Lessons for Future Tasks
- Timeout values are critical cross-references — always verify all sections when updating
- Cost estimation sections use ranges and should be treated separately from hard timeouts
- Incident runbook thresholds should match the actual timeout values they reference
