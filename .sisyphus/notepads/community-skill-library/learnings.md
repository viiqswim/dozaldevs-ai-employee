
## F3 re-QA — inngest watchdog path fix (verified PASS)
- Defect found in first F3 pass: `.opencode/skills/inngest/SKILL.md:16` referenced
  `src/inngest/watchdog.ts` (does not exist) for the ACTIVE `trigger/reviewing-watchdog`.
- Root cause: conflated with the DEPRECATED engineering watchdog path (AGENTS.md:40).
- Fix applied: line 16 now points to `src/inngest/triggers/reviewing-watchdog.ts` (the real,
  active file — imported by src/gateway/inngest/serve.ts:8; id defined at line 53).
- Re-verification:
  - `ls src/inngest/triggers/reviewing-watchdog.ts` -> exists
  - skill line 16 references correct path, cron `*/15 * * * *`
  - `grep "inngest/watchdog.ts" .opencode/skills/inngest/SKILL.md` -> empty (no stale ref)
- Lesson: when an active and deprecated component share a name (watchdog), verify the file
  path resolves on disk — don't trust AGENTS.md path strings, which may describe the
  deprecated variant.
