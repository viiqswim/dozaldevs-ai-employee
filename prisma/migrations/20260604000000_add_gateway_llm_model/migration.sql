-- Add gateway_llm_model platform setting
INSERT INTO "platform_settings" ("key", "value", "description", "is_required")
VALUES (
  'gateway_llm_model',
  'deepseek/deepseek-v4-flash',
  'LLM model used for gateway calls (classification, archetype generation, rule extraction). Must be a valid OpenRouter model ID. If available on OpenCodeGo and OPENCODE_GO_API_KEY is set, calls route through Go automatically.',
  true
)
ON CONFLICT ("key") DO NOTHING;
