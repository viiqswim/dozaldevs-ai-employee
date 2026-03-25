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
