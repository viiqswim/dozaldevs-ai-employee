# Learnings — plat09-rename-kb

## 2026-04-27 Session Start

### Validated Facts (pre-execution research)

- `src/worker-tools/kb/search.ts` is the ONLY file in the kb directory (194 lines)
- `search.ts` has ZERO npm dependencies — uses only native Node.js `fetch`. No `npm install` in Dockerfile.
- `search.ts` handles `--help` flag and exits 0 — Docker smoke test from ticket works as-is
- `vitest.config.ts` uses `tests/**/*.test.ts` glob — directory rename is safe, no silent test drops
- Seed uses `upsert` by archetype UUID — re-seeding safely updates `tool_registry` without duplicates
- Dockerfile currently has NO COPY block for kb — this is a gap; we ADD the new block, not rename an existing one
- AGENTS.md and src/workers/config/agents.md have zero `kb` references — PLAT-09 AGENTS.md criterion is already satisfied

### Complete Blast Radius (all files to touch)

| File                                               | Change Type                       | References               |
| -------------------------------------------------- | --------------------------------- | ------------------------ |
| `src/worker-tools/kb/`                             | git mv → `knowledge_base/`        | directory                |
| `tests/worker-tools/kb/`                           | git mv → `knowledge_base/`        | directory                |
| `src/worker-tools/knowledge_base/search.ts`        | edit 3 strings                    | lines 2, 9, 69           |
| `tests/worker-tools/knowledge_base/search.test.ts` | edit 2 strings                    | lines 6, 63              |
| `tests/gateway/seed-property-kb.test.ts`           | edit 2 strings                    | lines 56, 65             |
| `prisma/seed.ts`                                   | edit 3 strings                    | lines 423, 1217, 1246    |
| `Dockerfile`                                       | add 2 lines                       | after line 74            |
| `docs/2026-04-24-1452-current-system-state.md`     | edit 3 strings                    | lines 255, 455, 570      |
| `docs/2026-04-21-2202-phase1-story-map.md`         | edit 1 string + mark 8 checkboxes | line 611 + lines 466-473 |

### Guardrails

- DO NOT touch: prisma/migrations/, .sisyphus/plans/ historical files, src/inngest/, src/gateway/, src/lib/
- DO NOT touch: AGENTS.md (no kb refs), docs/2026-04-20-1314-current-system-state.md (superseded)
- DO NOT change PLAT-09 story description lines 455, 462 (describe the rename itself, not current state)
- MUST use `git mv` (not shell mv/rm/cp) for directory renames
