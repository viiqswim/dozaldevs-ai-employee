---
name: composio-openrouter
description: 'Use when working with Openrouter via the Composio integration — reading, writing, or managing Openrouter content. Requires Openrouter to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Openrouter

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| OPENROUTER_CREATE_CHAT_COMPLETION | Tool to generate a chat-style completion. Use after assembling messages and selecting a model. Supports streaming and function calls. Response format varies across models; use explicit prompt instructions to standardize output. Provider-level rate limits and moderation policies differ per model. |
| OPENROUTER_CREATE_COINBASE_CHARGE | Tool to create a Coinbase charge for crypto payment to add credits to your OpenRouter account. Use when you need to purchase credits using cryptocurrency. Returns calldata needed to fulfill the transaction on the specified blockchain. |
| OPENROUTER_CREATE_MESSAGE | Tool to create a message using Anthropic Messages API format via OpenRouter. Use when you need Claude-compatible chat completion with support for text, images, PDFs, tools, and extended thinking. |
| OPENROUTER_GET_CREDITS | Tool to get the current API credit balance for the authenticated user. Use before large or batch jobs to verify sufficient balance. A successful response may return total_credits=0, which confirms authentication but will cause all paid model generations to fail. Avoid polling this endpoint; call only as needed. |
| OPENROUTER_GET_CURRENT_KEY | Tool to get information about the currently authenticated API key. Use to check usage limits, spending, and key metadata. |
| OPENROUTER_GET_GENERATION | Tool to retrieve a generation result by its unique ID. Use after a generation completes to fetch metadata like token counts, cost, and latency. |
| OPENROUTER_GET_MODELS_COUNT | Tool to get the total count of available models on OpenRouter. Use when you need to know how many models are available without fetching the full list. |
| OPENROUTER_LIST_AVAILABLE_MODELS | Tool to list available models via OpenRouter API. Use after confirming authentication to fetch the model catalog. Use exact model IDs returned here in OPENROUTER_CREATE_CHAT_COMPLETION or OPENROUTER_CREATE_COMPLETION calls — hard-coded IDs may break when the catalog changes. Use exact author and slug values from this response as inputs to OPENROUTER_LIST_MODEL_ENDPOINTS. Models have varying capabilities (e.g., tools, reasoning); verify individual model capabilities before downstream use. Pricing and latency metadata may be null or approximate — handle missing values in routing logic. |
| OPENROUTER_LIST_EMBEDDING_MODELS | Tool to list all available embeddings models via OpenRouter API. Returns a list of embeddings models with their properties including architecture, pricing, and capabilities. |
| OPENROUTER_LIST_MODEL_ENDPOINTS | Tool to list endpoints for a specific model. Use after specifying model author and slug to get endpoint details including pricing, context length, and supported parameters. Some metadata fields (e.g., latency, pricing) may be null or approximate; handle missing values in routing logic. |
| OPENROUTER_LIST_PROVIDERS | Tool to list all AI model providers available through the OpenRouter API. Use after authentication to retrieve available provider options for routing configuration. Providers differ in latency, context window sizes, and rate limits — switching providers affects these constraints. Newly added providers may not appear immediately due to catalog propagation delays. |
| OPENROUTER_LIST_USER_MODELS | Tool to list models filtered by user provider preferences, privacy settings, and guardrails. Use after authenticating to get models tailored to the user's configuration. |
| OPENROUTER_LIST_ZDR_ENDPOINTS | Tool to preview the impact of Zero Data Retention (ZDR) on the available endpoints. Use to see which model endpoints remain accessible when ZDR is enabled. |
