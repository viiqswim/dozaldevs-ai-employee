# Decisions — custom-integration-skills

## [2026-06-13] User-confirmed design decisions

- Q1: Derive command paths from the registry (`toolInvocationPath()` shared helper) — NOT manual editing
- Q2: Keep `knowledge_base` directory snake_case + one-line `serviceToSkillName` mapping for skill folder name only
- Q3: Single umbrella `pnpm generate-skills` command (reference + per-service always + Composio when key present)
- Full mirror of Composio: include `## Custom Integrations` AGENTS.md section
- Slack via Composio is DISABLED → Slack detection = `slack_bot_token` secret only

## [2026-06-13] Task 2 — hand-written zone rewrite strategy

### The tension
Two requirements appeared to conflict:
1. HARD/testable: "no hand-typed `tsx /tools/...` paths in the hand-written zone" (in EXPECTED OUTCOME + plan AC #3 + grep QA)
2. SOFT: "preserve output-shape/example prose + 5 tribal warnings" (MUST NOT remove)

### Resolution (decision)
The HARD grep-testable criterion wins — it is the whole POINT of the task (kill hand-typed path drift).
"Preserve output-shape/example prose" is fully satisfiable WITHOUT `tsx /tools/` paths because:
- Output shapes are JSON blocks (contain no `tsx /tools/` paths) → kept verbatim.
- Behavioral notes, flag nuances, exit codes, env semantics → not in registry → kept.
- The per-tool invocation path is now single-sourced in the GENERATED `**Invocation**` line above the sentinel.
- Bash code fences that were PURELY a `tsx /tools/...` invocation are exactly the redundant hand-typed
  paths the task removes — deleting them IS the task, not a violation.
- Warnings reworded to reference tools by filename (e.g. `post-message.ts`) instead of full container path.

### Mechanism
Write the file fresh = fixed frontmatter + sentinel + new hand-written body, then run
`pnpm generate-tool-usage-skill`. The generator's buildContent() reads frontmatter (regex) + hand-written
(from sentinel to EOF) and regenerates the section in between from ALL_TOOL_DESCRIPTORS. No stale middle needed.
