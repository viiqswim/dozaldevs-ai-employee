# Learnings — fix-input-collection-i18n

## Project Conventions

- Test files live at `tests/` root — NOT `src/**/__tests__/`
- Dependency injection pattern for LLM calls — take `callLLMFn` as parameter (see `extract-inputs.ts`)
- `vi.hoisted()` for module mocks in Vitest
- Pre-existing test errors in `tests/inngest/lib/create-task-and-dispatch.test.ts` and `tests/inngest/interaction-handler-injection.test.ts` — DO NOT fix
- Commit messages: never reference AI tools, no `Co-authored-by`
- Never use `--no-verify`

## Key File Locations

- `src/inngest/slack-trigger-handler.ts` — PendingInputContext interface (line 14-23), single-input bypass (lines 323-325), multi-input LLM path (lines 326-342)
- `src/lib/extract-inputs.ts` — extractInputsFromText, system prompt (lines 28-35)
- `src/gateway/slack/handlers.ts` — PendingInputCollection (lines 60-75), race condition zone (lines 1717-1743), pendingInputCollections Map (line 76)
- `tests/inngest/slack-trigger-handler.test.ts` — existing trigger handler tests (174 lines)
- `tests/lib/extract-inputs.test.ts` — existing extraction tests (143 lines)

## Architecture Notes

- `PendingInputCollection` in `handlers.ts` already has `type?` and `options?` — the gap is only in `PendingInputContext` in `slack-trigger-handler.ts`
- The `.map()` at lines 1591-1597 in `handlers.ts` already preserves `type` and `options`
- `extractInputsFromText` already accepts `type` and `options` — no changes needed to its signature
- Single-input path currently bypasses LLM entirely; multi-input path already uses `extractInputsFromText`
- Race condition: `pendingInputCollections.set()` at line 1734 happens AFTER `chat.postMessage()` at line 1717
- When `ctx.threadTs` is set (always for @mention flows), we CAN set Map entry before postMessage
- When `ctx.threadTs` is null (edge case), key comes from `inputMsgResult.ts` — must keep current order

## Test Pattern

```typescript
// Module mock pattern
const { mockExtractInputsFromText } = vi.hoisted(() => ({
  mockExtractInputsFromText: vi.fn(),
}));
vi.mock('../../src/lib/extract-inputs.js', () => ({
  extractInputsFromText: mockExtractInputsFromText,
}));

// step.run mock
const step = {
  run: vi.fn().mockImplementation(async (_name, fn) => fn()),
};
```
