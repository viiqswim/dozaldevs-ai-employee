# Learnings — smart-input-extraction

## [2026-06-05] Session Start

### Key Codebase Conventions

- `routeToEmployee()` in `src/inngest/slack-trigger-handler.ts:32-71` is the EXACT pattern for injectable LLM calls:
  - Takes `callLLMFn: typeof callLLM` as parameter
  - Uses `<user_message>...</user_message>` XML delimiter tags
  - Parses with `JSON.parse(result.content.trim())`
  - Returns null on error (never throws)
- `callLLM` options: `{ messages, taskType: 'review', temperature: 0, maxTokens: N }`
- `PendingInputCollection` interface at `handlers.ts:57-65` — original shape has: archetypeId, tenantId, userId, channelId, text, roleName, requiredInputs
- `pendingInputCollections` is module-level Map at `handlers.ts:66` — needs `_clearPendingInputCollections()` export for tests
- Test files MUST go under `tests/` root — never `src/**/__tests__/`
- Pre-existing test errors in `create-task-and-dispatch.test.ts` and `interaction-handler-injection.test.ts` — do NOT fix

### Cleaning Schedule Employee

- Archetype ID: `00000000-0000-0000-0000-000000000019`
- Tenant: VLRE `00000000-0000-0000-0000-000000000003`
- Channel: `#ops-cleaning-schedule` (`C0B71QSMZKQ`)
- Slack workspace: `T06KFDGLHS6`
- input_schema: `[{key:"date", label:"Checkout Date", type:"date", required:true, frequency:"every_run", description:"Target checkout date (e.g. 2026-05-30)"}]`
- approval_required: false → goes straight to Done

## [2026-06-04] Task 1 — extractInputsFromText created

### File: src/lib/extract-inputs.ts

- `stripFences(s)` — removes ```json ... ``` or ``` ... ``` code fences
- `extractInputsFromText(text, fields, callLLMFn)` — injectable LLM call pattern (mirrors routeToEmployee)
  - Returns `{}` on empty text, empty fields, LLM failure, or JSON parse error — never throws
  - `type:'select'` fields validated against `options[]`; invalid values dropped silently
  - XML delimiter `<user_message>` used to prevent prompt injection
  - `import type { callLLM }` — only type import, actual fn injected at call site

### QA Scenarios (all passed):
1. Happy path: `{"date": "2026-06-05"}` extracted correctly
2. LLM failure: returns `{}` without throwing
3. Select validation: `"urgent"` not in `["low","medium","high"]` → dropped, result `{}`

### Build: `pnpm build` exits 0 — no TypeScript errors in new file
### Pre-existing errors in tests/inngest/lib/create-task-and-dispatch.test.ts and tests/inngest/interaction-handler-injection.test.ts — confirmed pre-existing, not introduced
