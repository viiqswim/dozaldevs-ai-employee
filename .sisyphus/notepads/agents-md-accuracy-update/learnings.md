# Learnings — agents-md-accuracy-update

## [2026-04-21] Session Init

- AGENTS.md is 372 lines, loaded into every LLM call — token-sensitive
- Ground-truth doc: `docs/2026-04-20-1314-current-system-state.md` (already in Reference Documents table)
- Pattern rule: inline ≤3 lines + operationally critical → inline; >5-row table / informational → reference pointer
- Line budget cap: ≤420 lines total (current 372 + ~48 max additions)
- "Do not modify deprecated components" applies to CODE, not AGENTS.md descriptions — the 29→30 fix is allowed
- All 3 task edits group into one commit: `docs: sync AGENTS.md with verified ground-truth system state doc`
- AGENTS.md uses markdown with standard heading hierarchy — do NOT reorder sections, do NOT create new top-level ## sections
- Shell tool note: `NODE_NO_WARNINGS=1` prefix is canonical; include it
- FEEDBACK_CONTEXT explanation must include its source (env var injected by lifecycle), not just say "optionally prepends"

## Task 2 — OpenCode Worker section augmentation (2026-04-21)

- Shell tools bullet: replaced single-line with 3-line block (header + 2 sub-bullets with exact CLI syntax)
- 3 new bullets inserted after Inngest functions bullet, before `**Cron timezone**` block
- `approval-message.json` now appears twice (shell tools example + output contract bullet) — expected, both are correct references
- Final line count: 377 (was 372, added 5 net lines)
- Edit approach: two surgical Edit calls with exact oldString/newString — no Write overwrite needed
