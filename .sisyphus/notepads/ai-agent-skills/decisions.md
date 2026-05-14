# Decisions — ai-agent-skills

## Architecture

- **No oh-my-openagent in containers** — native OpenCode skill discovery only
- **Skills baked into Docker image**: `src/workers/skills/` → COPY → `/app/.opencode/skills/`
- **Dev skills in repo root**: `.opencode/skills/` committed to git
- **All employee skills shared** — no per-archetype filtering (v1 simplicity)
- **Tiered approach**: static skills in image + dynamic rules via EMPLOYEE_RULES env var

## Scope

- IN: harness logging, Dockerfile COPY, 5 dev skills, 2 employee skills, Vitest tests, AGENTS.md docs
- OUT: remote URLs, per-archetype filtering, skill versioning, oh-my-openagent, feedback→skills

## Permission

- `"*": "allow"` in worker opencode.json already covers skill permission type
- No config change needed — just verify in tests

## Skill Content Rules

- Placeholder files first (Tasks 1-2), full content in Wave 2 (Tasks 5-11)
- Min 50-80 lines of substantive content per skill
- CLI flags MUST match actual source files — no guessing
- CRITICAL WARNINGS section required for high-risk patterns
