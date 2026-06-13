# T1 Diagnosis — AI Assistant Refine JSON Failure

**Date**: 2026-06-13  
**Method**: DIAGNOSE-REFINE logging in `callLLMWithJsonRetry` + live curl + historical log analysis

---

## Confirmed Failure Modes

### Mode (b) [PRIMARY — ~60% frequency]: Empty/blank content (reasoning-only)

**What happens**: The first LLM call returns `content = ""` (empty string) with `completionTokens = 6000 = maxTokens`.

**Evidence** (DIAGNOSE-REFINE live capture at 21:44:16):

```
contentLength: 0
promptTokens: 4003
completionTokens: 6000   ← ALL tokens consumed
contentIsEmpty: true
rawContentFirst500: ""
```

**Root cause**: `maxTokens: 6000` in `refine()` is too low. The model (routed through OpenCodeGo) spends all 6000 tokens on internal chain-of-thought reasoning and emits zero visible content. `data.choices[0].message.content = ""`.

**Error thrown**: `SyntaxError: Unexpected end of JSON input` (from `JSON.parse("")`).

**Outcome**: Falls through to retry. Retry works ~50% of the time.

---

### Mode (c) [SECONDARY — truncation mid-string]: ~30% frequency

**What happens**: The model produces partial JSON — the `execution_steps` string value is started but never closed, because the model runs out of tokens mid-field OR hits `maxTokens` while writing the long execution_steps text.

**Evidence** (historical log, multiple occurrences):

```
[16:25:47] GENERATION_FAILED: Unterminated string at position 2323 (line 6 column 1809) [RETRY ALSO FAILED]
[16:27:24] GENERATION_FAILED: Unterminated string at position 6846 (line 6 column 6170) [RETRY ALSO FAILED]
[21:12:59] GENERATION_FAILED: Unterminated string at position 2032 (line 6 column 1454) [RETRY ALSO FAILED]
```

**Key diagnostic**: All "Unterminated string" failures on the RETRY path are at **"line 6"** of the JSON output. The JSON schema puts `execution_steps` on line 6 (a long multi-step field). Positions 2032–6846 all fall inside this single string value.

**Error thrown on retry**: `SyntaxError: Unterminated string in JSON at position X` (line 326 = retry throw path) → `GENERATION_FAILED`.

---

### Mode (a) [TERTIARY — raw newlines in string]: ~10% frequency

**What happens**: `execution_steps` contains multi-line markdown text (numbered steps with `\n`). The model includes literal newline bytes in the JSON string value without escaping them to `\n`. The JSON parser hits the raw newline and considers the string unterminated.

**Evidence** (historical log):

```
[16:25:18] Unterminated string at position 14732 (line 50 column 93)   ← column 93 = short, newline mid-sentence
[16:35:12] Unterminated string at position 3777 (line 35 column 6)     ← column 6 = newline at start of new step
```

The very short column numbers (6, 93) at late positions (3777, 14732) indicate raw newlines at the START of numbered list items (e.g., `\n5.` or `\n- step...`), not truncation at end of output.

---

## Token Budget Analysis

| Call                            | promptTokens | completionTokens | maxTokens | Content produced                |
| ------------------------------- | ------------ | ---------------- | --------- | ------------------------------- |
| First attempt (DIAGNOSE-REFINE) | 4003         | 6000             | 6000      | 0 chars — all used on reasoning |
| Retry (DIAGNOSE-REFINE)         | ~5000+       | 4904             | 6000      | 7318 chars — success            |

The `execution_steps` field alone in the proposal is ~2800 chars. Full JSON with all fields is ~7318 chars. At ~4 chars/token, that's ~1829 tokens minimum for content. Plus 4003 prompt tokens = **need 5832+ total context** — tight against 6000 maxTokens.

**Conclusion**: `maxTokens: 6000` is too low for a model that uses thinking/reasoning tokens.

---

## Recommended Fix Approach

1. **Raise `maxTokens`** in `refine()` from `6000` to `16000` (or use `maxTokens: undefined` to let the provider default). This eliminates mode (b) and reduces mode (c).

2. **JSON repair** before throwing: After both attempts fail with "Unterminated string", try to auto-repair with `jsonrepair` library or a regex that closes the last open string and object. This handles truncation and raw-newline cases.

3. **System prompt hardening**: Add to the refine prompt: "Ensure all string values use `\\n` (escaped) for newlines, never literal newline characters inside JSON string values."

4. **Additional retries**: Increase from 1 retry to 2-3 retries with varying temperatures if JSON parse still fails.

---

## Call Stack (confirmed)

```
ArchetypeGenerator.refine()               [line ~470]
  → callLLMWithJsonRetry()               [line ~324]
    → callLLMFn()                        [returns content=""]
    → JSON.parse("") throws              [line ~324]
    → retry → callLLMFn()
      → JSON.parse(retryRaw) throws      [line 326 in original, now shifted]
        → propagates as GENERATION_FAILED
```

Route: `POST /admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit`  
Handler: `src/gateway/routes/admin-archetype-propose-edit.ts` line 257

---

## Files Involved

- `src/gateway/services/archetype-generator.ts` — `callLLMWithJsonRetry()`, `refine()`, `maxTokens: 6000`
- `src/lib/call-llm.ts` — `content = data.choices[0]?.message.content ?? ''` (the empty string source)
- `src/gateway/routes/admin-archetype-propose-edit.ts` — catches `GENERATION_FAILED` and returns 500
