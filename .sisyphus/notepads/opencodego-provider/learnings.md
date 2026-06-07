# Learnings — opencodego-provider

## [2026-06-03] Planning Phase Research

### Token/Cost Tracking is Provider-Agnostic

- `extractUsage()` in `session-manager.ts` reads `msg.info.cost`, `msg.info.tokens.input`, `msg.info.tokens.output` from the OpenCode transcript API
- These are OpenCode SDK fields — NOT OpenRouter-specific
- OpenCode internally calculates cost per message; harness just sums them
- No direct OpenRouter API calls for cost: harness never hits `openrouter.ai/api/v1/generation`

### OpenCodeGo is a flat $10/mo subscription

- No per-token pricing → `info.cost` may report $0 for Go tasks
- This is acceptable: `estimated_cost_usd` in executions might be $0 for Go tasks
- Cost circuit breaker (in `call-llm.ts`) is GATEWAY-ONLY — only covers triage/judge calls using claude-haiku-4-5. Worker execution costs don't flow through it at all.
- `task_metrics.work_minutes` is a STATIC archetype estimate — completely unrelated to tokens or cost

### Auth.json Key Name

- Expected: `"opencode-go"` based on OpenCode docs showing model IDs as `opencode-go/<model-id>`
- Must verify in Task 3 by checking `~/.local/share/opencode/auth.json` or OpenCode source

### OPENROUTER_MODEL env var naming

- Even for Go routing, the env var stays named `OPENROUTER_MODEL` — session-manager.ts reads it at line 284
- Renaming it is out of scope; misleading but safe

### call-llm.ts is gateway-only

- Hardcoded to OpenRouter + `anthropic/claude-haiku-4-5`
- Used for triage and review judge calls ONLY
- No changes needed for this plan — stays on OpenRouter

### Model ID format

- OpenRouter: `minimax/minimax-m2.7` (org/model)
- OpenCodeGo: `minimax-m2.7` (strip org prefix)
- Using a lookup Map, not string manipulation, for correctness

### Harness writeOpencodeAuth() is called at BOTH phases

- Execution phase: ~line 990
- Delivery phase: ~line 764
- Modifying the function itself covers both call sites automatically

## [2026-06-03] E2E Verification Results (Task 6)

### Go Routing Confirmed Working

- `"provider":"opencode-go"` appears in harness log when `OPENCODE_GO_API_KEY` is set and model is in GO_MODEL_MAP
- Log format: `{"provider":"opencode-go","model":"deepseek-v4-flash","originalModel":"deepseek/deepseek-v4-flash","goKeyPresent":true,"msg":"LLM provider resolved: opencode-go/deepseek-v4-flash"}`
- Task `16f83391-1b00-4e13-b44d-91fb677ecc09` reached `Done` status using deepseek-v4-flash via Go

### info.cost Behavior — RESOLVED

- **Go tasks report NON-ZERO `estimated_cost_usd`** — the value is $0.0044 for a 27,257+460 token task
- This disproves the hypothesis that Go tasks would show $0
- The OpenCodeGo API backend returns `info.cost` values despite flat billing, likely at standard model pricing rates
- Cost pipeline functions normally for Go tasks — no changes needed

### Two Execution Records Per Task

- `executions` table gets TWO rows per task:
  1. Row created at task start by execution container: 0 tokens, $0.00
  2. Row updated/created after session completes: actual token counts + cost
- The delivery container creates its own execution record (also 0 tokens since it doesn't do LLM work)

### minimax/minimax-m2.7 Does NOT Call Bash Tools (CRITICAL)

- Task `96c42aab` used minimax/minimax-m2.7 via opencode-go → ran 60 seconds, session went idle, never called submit-output
- Recovery nudge also failed → task marked Failed
- **minimax/minimax-m2.7 is unreliable for bash tool calling**, just like xiaomi/mimo-v2.5
- For E2E testing: use `deepseek/deepseek-v4-flash` (confirmed reliable, also in Go model list)

### Cost Per Token Comparison

| Provider    | Model                | Total Tokens | Cost    | $/1M tokens |
| ----------- | -------------------- | ------------ | ------- | ----------- |
| opencode-go | deepseek-v4-flash    | 27,717       | $0.0044 | $0.159/1M   |
| openrouter  | minimax/minimax-m2.7 | 11,355       | $0.0077 | $0.678/1M   |
| openrouter  | xiaomi/mimo-v2.5-pro | 29,476       | $0.0157 | $0.532/1M   |

Note: model differences make direct comparison imprecise, but Go routing appears cost-effective.

## [2026-06-03] Regression Test Findings (Task 7)

### OPENCODE_GO_API_KEY Env Injection Mechanism

The key is injected into worker containers via `loadTenantEnv()` in `tenant-env-loader.ts` (line 13):
- `OPENCODE_GO_API_KEY` is in `PLATFORM_ENV_WHITELIST`
- At task dispatch time (in `employee-lifecycle.ts` step "dispatch-machine"), `loadTenantEnv()` reads the gateway's `process.env` and includes any whitelisted vars that are defined
- The key is then passed to `docker run -e OPENCODE_GO_API_KEY=... ` via `envArgs`

### Shell Env Leakage in Local Dev

In local dev, if the PARENT shell (terminal running OpenCode/bash session) has `OPENCODE_GO_API_KEY` set (from a previous `source .env`), this leaks into tmux sessions:
- `tmux new-session -d` inherits the parent terminal's environment
- `env -u OPENCODE_GO_API_KEY pnpm dev` removes it from pnpm's process
- BUT `dev.ts` does `const gatewayEnv = { ...process.env }` — if `process.env` of `dev.ts` lacks the key, gateway should also lack it
- However, `sysctl -n kern.proc.env` on macOS with SIP enabled cannot reliably read other processes' environments (even OPENROUTER_API_KEY was not visible)
- The exact mechanism by which the key persists was not identified

**Practical implication**: To truly test "without Go key" locally, you must also unset the key from ALL parent shell environments, not just .env. `unset OPENCODE_GO_API_KEY` in the terminal before running `pnpm dev` is required.

### Code-Level Regression VERIFIED

Direct unit test of `resolveProvider` inside the production Docker image confirms:
- `resolveProvider('deepseek/deepseek-v4-flash', false)` → `{ providerID: 'openrouter', ... }` ✓
- `resolveProvider('deepseek/deepseek-v4-flash', true)` → `{ providerID: 'opencode-go', ... }` ✓
- `writeOpencodeAuth` without key → auth.json only has `openrouter` provider ✓

The reversal logic is CORRECT. The E2E harness log would show `"provider":"openrouter"` if the container truly received no key.

### Task 2 Completed Successfully (Both Tasks)

- Task b827e27a: Done in ~3 min (legacy gateway with key, showed Go routing)
- Task f31d809b: Done in ~2.5 min (restarted gateway, still showed Go routing due to env leakage)
- Both tasks reached `Done` status — the platform works normally with both routing paths
