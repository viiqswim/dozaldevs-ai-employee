# Decisions

## [2026-06-18] Architectural Decisions (from user + Metis review)

- **No regex/text-scrubber**: explicitly rejected by user. LLM must not generate plumbing; if it does, LLM regenerates.
- **Single source**: no-leak rule lives ONCE in `ARCHETYPE_AUTHORING_RULES` — propagates to GENERATE and WIZARD-CREATE paths automatically.
- **REFINE path**: already has its own no-leak rule at line 474 — leave it, it's already covered.
- **Judge model**: default gateway_llm_model (no hardcoded model ID).
- **Judge response format**: `{ "has_leak": boolean, "fields": string[], "snippets": string[] }` — strict JSON.
- **Retry wiring**: judge/retry runs BEFORE `applyModelAndEstimate` in generate(); only `proposal` branch in converse() gets judged.
- **DEFAULT_DELIVERY_INSTRUCTIONS**: rewrite to plain English, no /tmp/, no tool names.
- **World-B copy**: regenerate via `pnpm generate-worker-constants` — never hand-edit.
