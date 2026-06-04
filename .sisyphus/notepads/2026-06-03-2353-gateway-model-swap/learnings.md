# Learnings — gateway-model-swap

## [2026-06-04] Session Start

### Key Architecture Facts

- `call-llm.ts` uses OpenAI chat format (raw fetch to `/chat/completions`) — only OpenAI-compatible Go models can route through Go
- Go OpenAI endpoint: `https://opencode.ai/zen/go/v1/chat/completions`
- Go Anthropic endpoint: `https://opencode.ai/zen/go/v1/messages` (NOT usable by call-llm.ts)
- `go-models.ts` currently at `src/workers/lib/go-models.ts` — must move to `src/lib/go-models.ts`
- `getPlatformSetting()` makes a DB call every time — need 60s TTL cache in call-llm.ts
- Dashboard settings page dynamically renders all `platform_settings` rows — no UI code changes needed
- 8 existing platform settings all have `is_required = true`

### Flash Pricing

- Input: $0.14/M tokens, Output: $0.28/M tokens

### Go Endpoint Type Split (14 models)

- OpenAI-compatible (8): deepseek-v4-flash, deepseek-v4-pro, glm-5.1, glm-5, kimi-k2.5, kimi-k2.6, mimo-v2.5, mimo-v2.5-pro
- Anthropic-compatible (6): minimax-m3, minimax-m2.7, minimax-m2.5, qwen3.7-max, qwen3.7-plus, qwen3.6-plus

### Constraints (NEVER VIOLATE)

- Do NOT add model dropdown/validation UI to dashboard — plain text input only
- Do NOT make PRICING_PER_1M_TOKENS dynamic — hardcode Flash entry as static addition
- Do NOT add JSON parse retry to rule-extractor.ts or rule-synthesizer.ts — only archetype-generator.ts
- Do NOT add cost tracking for gateway calls
- Do NOT modify session-manager.ts
- Do NOT modify worker harness Go routing logic
- Do NOT add automatic failover
- Do NOT implement Anthropic messages format in call-llm.ts

## Task 1: gateway_llm_model platform setting

- `pnpm prisma migrate dev` fails with shadow DB error (P3006/P1014) — use manual migration file + `migrate deploy` instead
- Migration file created at `prisma/migrations/20260604000000_add_gateway_llm_model/migration.sql` with `ON CONFLICT DO NOTHING`
- Seed pattern: add to `platformSettings` array in `prisma/seed.ts` before the closing `];`
- Row verified: `key=gateway_llm_model, value=deepseek/deepseek-v4-flash, is_required=t`
- Pre-existing test failure: `get-properties shell tool > happy path` — unrelated to this task

## Task 4: Remove hardcoded model from call sites (2026-06-04)

### Pattern used
Remove `model: 'anthropic/claude-haiku-4-5'` line only — keep `taskType`, `messages`, `temperature`, `maxTokens` unchanged.

### Remaining haiku refs after task (expected):
1. `src/lib/call-llm.ts` — pricing lookup table `{ prompt: 0.8, completion: 4.0 }`. NOT a call site. Must stay.
2. Test files (`__tests__/`) — Task 6 responsibility. Tests assert the old model; Task 6 updates them.

### Test regressions introduced (expected, Task 6 will fix):
- `tests/inngest/rule-extractor.test.ts` — "model enforcement" test asserts model === haiku
- `tests/gateway/services/interaction-classifier.test.ts` — asserts haiku model passed

### Pre-existing failures (not regressions):
- `tests/worker-tools/hostfully/get-properties.test.ts` — pagination bug
- `src/worker-tools/notion/__tests__/get-page.test.ts` — mock fixture failures (3 tests)

### Commit: `b609fba3`
`refactor(gateway): remove hardcoded model from all LLM callers`
6 files changed, 8 deletions(-)

## Task 7: E2E Smoke Test — Gateway Flash via Go Routing (2026-06-04)

### Results

**Archetype Generation: PASS**
- Endpoint: `POST /admin/tenants/.../archetypes/generate`
- `role_name`: `daily-motivational-quote` (non-empty ✓)
- `identity`: 185+ chars, well-formed ✓
- `execution_steps`: 680+ chars, 3 numbered steps ✓
- `delivery_steps`: present ✓
- `deliverable_type`: `slack_message` ✓

**Go Routing: CONFIRMED**
- Log evidence: `"component":"call-llm","provider":"opencode-go","model":"deepseek/deepseek-v4-flash"`
- Multiple calls logged: initial + retry (one JSON parse failure on second independent call, auto-recovered)
- `OPENCODE_GO_API_KEY` IS set → routing through OpenCodeGo (not OpenRouter)

**Dashboard Settings: PASS**
- `gateway_llm_model` row visible in UI ✓
- Value: `deepseek/deepseek-v4-flash` ✓
- Required: yes ✓
- Last updated: Jun 4, 2026, 12:06 AM ✓
- Description shown: "LLM model used for gateway calls (classification, archetype generation, rule extraction)..."

### Evidence Files
- `.sisyphus/evidence/task-7-wizard-flash.txt` — archetype generation result summary
- `.sisyphus/evidence/task-7-wizard-flash-raw.json` — full raw API response
- `.sisyphus/evidence/task-7-go-routing-logs.txt` — gateway logs showing opencode-go provider
- `.sisyphus/evidence/task-7-dashboard-settings.png` — dashboard screenshot

### Observation: JSON Parse Retry on Flash
One call (the 2nd independent archetype gen call) triggered a JSON parse retry:
`"JSON parse failed on first attempt — retrying with nudge"`
This is expected/benign — `callLLMWithJsonRetry` handles it automatically and the final
response was valid. Flash occasionally outputs trailing commas or other minor JSON quirks.
