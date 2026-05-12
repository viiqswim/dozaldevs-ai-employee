# Fix Guest Message Scoping — Stop Wrong-Guest Responses

## TL;DR

> **Bug**: The guest-messaging employee responded to "c.e. Wilson" when the webhook was triggered by Olivia's Airbnb message. Root cause: `get-messages.ts --unresponded-only` without `--lead-id` scans ALL leads and the model can pick the wrong guest.
>
> **Fix**: Harden `get-messages.ts` to enforce lead-scoped retrieval (tool guard + env var fallback) and drop `--unresponded-only` from archetype instructions.
>
> **Blast radius**: 2 code files (`get-messages.ts`, `seed.ts`), 1 docs file (`AGENTS.md`), Docker rebuild, DB reseed, E2E verification.

---

## Context

### Root Cause

- Webhook injects `LEAD_UID`, `THREAD_UID`, `PROPERTY_UID`, `MESSAGE_UID` as env vars into the worker
- Archetype instructions tell model to call `get-messages.ts --lead-id "$LEAD_UID" --unresponded-only`
- If the model drops `--lead-id` (hallucination, env var expansion failure), `--unresponded-only` alone scans ALL leads and the model picks whichever thread it considers most relevant — which was c.e. Wilson
- The `--unresponded-only` flag serves the polling cron's purpose, not the webhook path. The lifecycle pre-check already decides IF we respond; the worker should focus on WHAT to say with full conversation context

### Agreed Fix

1. **Harden `get-messages.ts`**: When `--lead-id` is provided, always return full conversation (ignore `--unresponded-only`). When `LEAD_UID` env var is set but `--lead-id` not passed, auto-use the env var.
2. **Update archetype instructions**: Drop `--unresponded-only` from the webhook command in `prisma/seed.ts`.
3. **Polling cron path unchanged**: `--unresponded-only` without `--lead-id` continues to work for `guest-message-poll`.

---

## Guardrails

### Must Have

- `get-messages.ts --lead-id X --unresponded-only` → ignores filter, returns full conversation
- `get-messages.ts` without `--lead-id` but with `LEAD_UID` env var → auto-uses env var with warning log
- `get-messages.ts --unresponded-only` (no `--lead-id`, no env var) → scans all leads unchanged
- E2E: Olivia's message → approval card shows "Olivia"

### Must NOT Have

- No new CLI flags
- Output JSON shape unchanged (model and `post-guest-approval.ts` depend on it)
- Pre-check logic in `employee-lifecycle.ts` untouched
- Polling cron trigger function (`guest-message-poll.ts`) untouched

---

## TODOs

- [x] 1. Harden `get-messages.ts` — tool-level guard + env var fallback
- [x] 2. Update archetype instructions in `prisma/seed.ts` — drop `--unresponded-only`
- [x] 3. Update AGENTS.md — fix stale `--unresponded-only` references
- [x] 4. Rebuild Docker image + re-seed database
- [x] 5. E2E prerequisites — confirm services are live
- [x] 6. E2E Scenario A — approve happy path with guest name verification
- [x] 7. Notify completion

---

## Final Verification Wave

- [x] F1. Plan compliance audit (oracle)
- [x] F2. Code quality review (unspecified-high)
- [x] F3. Real manual QA (unspecified-high + dev-browser)
- [x] F4. Scope fidelity check (deep)
