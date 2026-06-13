# OPENROUTER_LIST_AVAILABLE_MODELS

**Description**: Tool to list available models via OpenRouter API. Use after confirming authentication to fetch the model catalog. Use exact model IDs returned here in OPENROUTER_CREATE_CHAT_COMPLETION or OPENROUTER_CREATE_COMPLETION calls — hard-coded IDs may break when the catalog changes. Use exact author and slug values from this response as inputs to OPENROUTER_LIST_MODEL_ENDPOINTS. Models have varying capabilities (e.g., tools, reasoning); verify individual model capabilities before downstream use. Pricing and latency metadata may be null or approximate — handle missing values in routing logic.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
