# Decisions — smart-input-extraction

## [2026-06-05] Session Start

### Extraction approach

- Use LLM extraction via callLLM() (gateway model) — handles natural language dates, scales to any field type
- Graceful fallback: on ANY error (LLM failure, JSON parse error), return {} — caller falls through to "ask all"

### Confirmation UX

- All inputs found → second LLM call for human-friendly confirmation ("Just to confirm, you want me to run X for June 5th, correct?")
- Fallback if second LLM fails: template "Just to confirm, you want me to trigger {role_name} with {key}: {value}. Working on it!"
- Then dispatch task immediately

### Multi-input fix

- Single input (requiredInputs.length === 1): assign text directly, no LLM needed
- Multiple inputs (requiredInputs.length > 1): use extractInputsFromText per-field
- Fallback: if extraction returns fewer keys than required, assign text to all keys (safety net)
- Merge: { ...pending.extractedInputs, ...collectedInputs } — user reply overrides pre-extracted

### Test strategy

- Tests-after (not TDD)
- All new test files under tests/ root
