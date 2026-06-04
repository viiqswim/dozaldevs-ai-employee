# Decisions — gateway-model-swap

## [2026-06-04] Initial Decisions

- Replace `anthropic/claude-haiku-4-5` with `deepseek/deepseek-v4-flash` for all 8 gateway call sites
- Model stored in `platform_settings` DB (key: `gateway_llm_model`), editable in dashboard
- Auto-route through Go when `OPENCODE_GO_API_KEY` is set AND model is OpenAI-compatible Go model
- OpenRouter fallback for Anthropic-compatible Go models and non-Go models
- 60s TTL cache for platform setting reads in call-llm.ts
- JSON parse retry (1 retry) only in archetype-generator.ts
