# Learnings

## [2026-06-03] Session start

- Plan: 2026-06-03-1745-opencode-go-models
- 9 implementation tasks + F1-F4 final wave
- Wave 1: Tasks 1 (migration) → 2 (API schema) + 3 (dashboard UI) in parallel after Task 1
- Wave 2: Tasks 4, 5, 6, 7 — parallel scraping/seeding of 14 models
- Wave 3: Tasks 8 (AGENTS.md update) + 9 (notify)
- Key constraint: Task 7 runs `pnpm prisma db seed` AFTER tasks 4, 5, 6 all finish seed edits

## Architecture Notes

- ModelCatalog table: `prisma/schema.prisma` lines 545-574
- Existing seed: `prisma/seed.ts` lines 4742-4836 — MODEL_CATALOG_ENTRIES array
- Admin API: `src/gateway/routes/admin-model-catalog.ts` — POST/PATCH/GET/DELETE
- Test fixture: `src/gateway/routes/__tests__/admin-model-catalog.test.ts` — makeModelRow()
- Dashboard: `dashboard/src/pages/ModelCatalogPage.tsx` — ModelForm interface, EMPTY_FORM, entryToForm(), formToPayload()
- Dashboard types: `dashboard/src/lib/types.ts:366-391` — ModelCatalogEntry interface
- `notes` field is the pattern to follow for `strengths` and `weaknesses` (String? @db.Text)

## Task 1: Migration for strengths/weaknesses columns

- `pnpm prisma migrate dev` fails with P3006 shadow DB error because the `20260601214116_add_rls_policies` migration enables RLS on `_prisma_migrations` which doesn't exist in the shadow DB at migration time
- Workaround: manually create the migration SQL file in `prisma/migrations/` then run `pnpm prisma migrate deploy` (bypasses shadow DB)
- Migration naming: `YYYYMMDDHHMMSS_<name>/migration.sql`
- PostgREST reload: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"`
- `.sisyphus/evidence/` is gitignored — evidence files are local only
- Pre-existing test failures: `get-properties` (Hostfully) and `get-page.ts` (Notion) shell tool tests — unrelated to schema changes

## Task 3: Dashboard UI — Usage Guidance fields

- `ModelForm` interface: added `strengths: string` and `weaknesses: string`
- `EMPTY_FORM`: added `strengths: ''` and `weaknesses: ''`
- `entryToForm()`: `entry.strengths ?? ''` and `entry.weaknesses ?? ''`
- `formToPayload()`: `form.strengths.trim() || null` (NOT undefined — TypeScript enforces `string | null` from types.ts)
- Usage Guidance card placed AFTER Performance Metrics, BEFORE Status card
- Label text exactly: "Strengths — when to use this model" and "Weaknesses — when NOT to use this model"
- Textarea class matches notes textarea: `flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none`
- rows={4} for larger textarea (vs rows={2} used for notes/description)
- Browser: Playwright MCP needed `pkill -f "mcp-chrome"` to unblock after parallel agent usage
- Vite dev server must be started separately: `cd dashboard && pnpm dev` (not included in `pnpm dev` apparently)
- Screenshot saved to `.sisyphus/evidence/task-3-dashboard-fields.png` — verified UI shows correctly

## Task 5 Batch 2 — 4 new models added

- OpenRouter uses `qwen/qwen3.7-max` and `qwen/qwen3.7-plus` slugs but go-models.ts uses `alibaba/qwen3.7-max` / `alibaba/qwen3.7-plus` — the `model_id` in seed must match go-models.ts slug
- `xiaomi/mimo-v2.5-pro` and `xiaomi/mimo-v2.5` were already in DB (from earlier `/v-add-openrouter-model` command) but without strengths/weaknesses — needed PATCH to add them
- Admin POST API rejects explicit `null` for optional numeric fields — must omit them entirely (schema is `z.number().optional()` not `.nullable()`)
- Evidence: `.sisyphus/evidence/task-5-batch2-api-verify.txt` and `task-5-batch2-seed-verify.txt`
- Pricing: mimo-v2.5-pro $0.435/$0.87, mimo-v2.5 $0.14/$0.28, qwen3.7-max $1.25/$3.75, qwen3.7-plus $0.40/$1.60

## Task 7 Batch 4 — 2 DeepSeek models added

- deepseek/deepseek-v4-flash was already in DB (created 2026-05-22) without strengths/weaknesses — needed PATCH not POST
- Live OpenRouter pricing: deepseek-v4-pro $0.435/$0.87, deepseek-v4-flash $0.0983/$0.1966
- Task instructions had wrong pricing for deepseek-v4-flash ($0.14/$0.28 was mimo-v2.5 pricing) — corrected to actual
- `pnpm prisma db seed` ran cleanly: "ModelCatalog upserted: 14 models (global)"
- Wave 2 commit: `feat(model-catalog): add 14 OpenCode Go models to seed and catalog` (0be999c8)
- grep "model_id: '" | grep -E "minimax|deepseek..." counts 16 due to 2 extra model_id refs for archetype defaults — array has 14 entries
