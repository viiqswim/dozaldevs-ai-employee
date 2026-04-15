# Issues — summarizer-mvp

## [2026-04-15] No issues yet — execution starting

## [2026-04-15] Deliverable Schema Gap
- The `Deliverable` model in prisma/schema.prisma does NOT have `content` or `metadata` fields
- Plan references `deliverable.content` and `deliverable.metadata.approval_message_ts` but these don't exist
- T9 (generic harness) needs to write summary content somewhere
- T10 (lifecycle) needs to read it after approval
- RESOLUTION: T9 should add `content String? @db.Text` and `metadata Json?` to Deliverable model via migration, OR use the Task.requirements/triage_result fields as a workaround
- RECOMMENDED: Add content + metadata fields to Deliverable via new migration in T9 scope
