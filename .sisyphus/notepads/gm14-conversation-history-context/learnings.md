# GM-14 Learnings

## Key Architecture Facts
- `get-messages.ts --unresponded-only` already returns full `messages[]` per thread (chronological, up to --limit 30)
- System prompt in `prisma/prompts/guest-messaging.ts` — has `conversationSummary` OUTPUT field at line 131 but NO input section for how to USE conversation history
- `VLRE_GUEST_MESSAGING_INSTRUCTIONS` in `prisma/seed.ts:226` — Step 3 says "guest message text" not "full conversation thread"
- Archetype ID: `00000000-0000-0000-0000-000000000015` (VLRE guest-messaging)
- Archetype slug: `guest-messaging` (NOT daily-summarizer)

## Test Patterns
- Prompt content tests: `tests/lib/system-prompt-injection.test.ts` — direct string assertions on imported constants
- Seed content tests: `tests/gateway/seed-guest-messaging.test.ts` — DB queries with `toContain()` assertions
- `pnpm test:db:setup` required after seed changes to apply to test DB

## CRITICAL: What NOT to touch
- `get-messages.ts` — already works
- `ClassifyResult` interface — already has conversationSummary
- `parseClassifyResponse` — already handles it
- `post-guest-approval.ts` — already renders it
- DozalDevs archetype `00000000-0000-0000-0000-000000000012`

## Task 1 — Prompt Section Insertion (completed)
- Inserted `CONVERSATION HISTORY CONTEXT:` section between SECURITY and TONE & STYLE RULES sections
- File: `prisma/prompts/guest-messaging.ts` — template literal (backtick string), uses `\n` for line breaks
- The compiled JS is NOT output to `dist/prisma/` — use `npx tsx -e "import ..."` for verification, not `node -e "require('./prisma/prompts/guest-messaging.js')"`
- Section indices after insertion: SECURITY=571, CONVERSATION HISTORY=1174, TONE=2177
- All 3 verification checks passed; evidence saved to `.sisyphus/evidence/task-1-*.txt`
