---
description: Add a model from an OpenRouter URL to the global model catalog
---

Add an OpenRouter model to the global model catalog by fetching its metadata, scraping performance data, and posting to the admin API.

## Argument

<argument>OpenRouter URL (e.g. https://openrouter.ai/openai/gpt-oss-120b or https://openrouter.ai/openai/gpt-oss-120b/performance)</argument>

---

## Step 1 — Parse the URL

Extract the model identifier from the argument:

1. Strip the domain (`https://openrouter.ai/`).
2. Take the next two path segments as `{org}/{model}` — e.g. `openai/gpt-oss-120b`.
3. Discard any trailing path segments (`/performance`, `/benchmarks`, `/api`, etc.).
4. Set `model_id = "{org}/{model}"` (e.g. `openai/gpt-oss-120b`).
5. Set `org = first segment` (e.g. `openai`).
6. Set `model_slug = second segment` (e.g. `gpt-oss-120b`).

---

## Step 2 — Forbidden model check

**Before any API calls**, check if `model_id` matches any forbidden pattern:

| Pattern                     | Match type                    |
| --------------------------- | ----------------------------- |
| `anthropic/claude-sonnet-*` | Wildcard — any version suffix |
| `anthropic/claude-opus-*`   | Wildcard — any version suffix |
| `openai/gpt-4o`             | Exact match only              |
| `openai/gpt-4o-mini`        | Exact match only              |

If the `model_id` matches **any** of these patterns → **abort immediately** with:

```
❌ Forbidden model: {model_id}
This model is hardcoded in production verifier paths and must not be added to the catalog.
See AGENTS.md § Approved LLM Models for details.
```

Do NOT proceed to any API calls if this check fails.

---

## Step 3 — Preflight checks

Run both checks before touching any external service:

```bash
# 1. Gateway health
curl -sf http://localhost:7700/health || { echo "❌ Gateway not running — start services first (pnpm dev)"; exit 1; }

# 2. API key
source .env
[ -n "$ADMIN_API_KEY" ] || { echo "❌ ADMIN_API_KEY not set in .env"; exit 1; }
```

If either check fails → abort with the error message shown. Do NOT proceed.

---

## Step 4 — Fetch OpenRouter API data

Fetch the full model list (no auth required):

```bash
curl -s https://openrouter.ai/api/v1/models
```

The response is a JSON object with a `data` array of model objects. Filter for the entry where `id === model_id`.

If not found → abort with:

```
❌ Model not found: {model_id}
Verify the URL is correct. Try browsing https://openrouter.ai/models to confirm the model exists.
```

Extract and transform fields using this mapping:

| OpenRouter API field                                   | Catalog field                | Transform                                                     |
| ------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| `id`                                                   | `model_id`                   | direct                                                        |
| `name`                                                 | `display_name`               | direct                                                        |
| `id.split('/')[0]`                                     | `provider`                   | extract the part before the first `/`                         |
| `description`                                          | `description`                | truncate to 500 characters if longer                          |
| `context_length`                                       | `context_window`             | direct (integer)                                              |
| `pricing.prompt`                                       | `input_cost_per_million`     | `parseFloat(pricing.prompt) * 1_000_000`                      |
| `pricing.completion`                                   | `output_cost_per_million`    | `parseFloat(pricing.completion) * 1_000_000`                  |
| `supported_parameters` includes `"tools"`              | `supports_tools`             | `true` if array contains `"tools"`, else `false`              |
| `supported_parameters` includes `"structured_outputs"` | `supports_structured_output` | `true` if array contains `"structured_outputs"`, else `false` |
| `pricing.prompt === "0"`                               | `is_free`                    | `true` if prompt price string is `"0"`, else `false`          |

**Notes:**

- `pricing.prompt` and `pricing.completion` are strings representing cost per token (e.g. `"0.000001"`). Multiply by 1,000,000 to get cost per million tokens.
- If `supported_parameters` is missing or null, default both `supports_tools` and `supports_structured_output` to `false`.

---

## Step 5 — Scrape OpenRouter performance page

Use the Playwright MCP to navigate to:

```
https://openrouter.ai/{org}/{model}/performance
```

Find the per-provider metrics table. Use the **best** values across all providers:

| Metric                       | Best value               | Catalog field                  | Transform                         |
| ---------------------------- | ------------------------ | ------------------------------ | --------------------------------- |
| Throughput                   | **highest** tok/s value  | `throughput_tokens_per_sec`    | direct (number)                   |
| Latency (TTFT or median)     | **lowest** seconds value | `latency_seconds`              | direct (number)                   |
| Tool Call Error Rate         | **lowest** percentage    | `tool_call_error_rate`         | divide by 100 (e.g. 3.2% → 0.032) |
| Structured Output Error Rate | **lowest** percentage    | `structured_output_error_rate` | divide by 100                     |

**If the page fails to load, metrics are not found, or the table is empty:**

- Set all 4 fields to `null`
- Log: `⚠️ Performance data unavailable — will proceed without it`
- **CONTINUE — do not abort**

---

## Step 6 — Scrape Artificial Analysis leaderboard

Use the Playwright MCP to navigate to:

```
https://artificialanalysis.ai/leaderboards/models
```

1. Find the filter input: `input[placeholder="Filter, e.g. GPT, Meta"]`
2. Type the model name (just `model_slug`, e.g. `gpt-oss-120b`)
3. Wait for the table to filter (wait up to 5 seconds for results to appear)
4. Find the **Intelligence Index** column value for the matching row → `quality_index` (numeric, e.g. `67.3`)

**If any of the following occur:**

- Page fails to load
- Filter input not found
- No matching row after filtering
- Intelligence Index value not found or not numeric

→ Set `quality_index = null`, log `⚠️ Artificial Analysis data unavailable — will proceed without it`, **CONTINUE**.

> **CRITICAL**: This step MUST NEVER abort the command. AA scraping is best-effort enrichment only. Any failure here is a warning, not an error.

---

## Step 7 — Build the POST body

Combine all gathered data into a JSON object matching `CreateModelCatalogBodySchema`.

**Required fields** (must all be present — abort if any are missing after Step 4):

- `model_id` (string)
- `display_name` (string)
- `provider` (string)
- `context_window` (integer > 0)
- `input_cost_per_million` (number ≥ 0)
- `output_cost_per_million` (number ≥ 0)
- `supports_tools` (boolean)
- `supports_structured_output` (boolean)

**Optional fields** (include only if non-null):

- `description`
- `is_free`
- `throughput_tokens_per_sec`
- `latency_seconds`
- `tool_call_error_rate`
- `structured_output_error_rate`
- `quality_index`
- `notes`

**Always include:**

```json
"notes": "Added via /v-add-openrouter-model on YYYY-MM-DD"
```

(replace `YYYY-MM-DD` with today's actual date)

**Do NOT send null values** — omit any optional field that is null rather than sending `"field": null`.

---

## Step 8 — POST to global catalog

```bash
source .env
curl -s -w "\n%{http_code}" -X POST "http://localhost:7700/admin/model-catalog" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '<JSON body from Step 7>'
```

Interpret the HTTP status code:

| HTTP Code         | Meaning                         | Action                                        |
| ----------------- | ------------------------------- | --------------------------------------------- |
| `201`             | Created                         | ✅ Success — model added to catalog           |
| `409`             | Conflict — already exists       | ⚠️ Already Exists — not an error, report it   |
| `400`             | Bad request — validation failed | ❌ Failed — log the response body for details |
| Other `4xx`/`5xx` | Error                           | ❌ Failed — log status code and response body |

> **Note**: The catalog is global — no tenant ID in the URL. The endpoint is `/admin/model-catalog`, not `/admin/tenants/:id/...`.

---

## Step 9 — Summary output

Print a summary table:

```
Model: {model_id}
Display Name: {display_name}
Provider: {provider}

Fields populated:
  model_id:                    {value}
  display_name:                {value}
  provider:                    {value}
  context_window:              {value}
  input_cost_per_million:      {value}
  output_cost_per_million:     {value}
  supports_tools:              {value}
  supports_structured_output:  {value}
  description:                 {value or "—"}
  is_free:                     {value or "—"}
  throughput_tokens_per_sec:   {value or "— (not scraped)"}
  latency_seconds:             {value or "— (not scraped)"}
  tool_call_error_rate:        {value or "— (not scraped)"}
  structured_output_error_rate:{value or "— (not scraped)"}
  quality_index:               {value or "— (AA unavailable)"}
  notes:                       {value}

Result: ✅ Created  |  ⚠️ Already Exists  |  ❌ Failed
```
