# T5: Create poll-completion.test.ts

## Status: ✅ COMPLETE

### Deliverables
- ✅ File created: `tests/inngest/lib/poll-completion.test.ts` (162 lines)
- ✅ Directory created: `tests/inngest/lib/`
- ✅ 8 test cases defined (all failing as expected)
- ✅ Runtime: 219ms (well under 5 seconds)
- ✅ Existing tests unaffected (fly-client.test.ts still passes)

### Test Cases (8 total)
1. ✅ Completes on first poll with Submitting status
2. ✅ Completes with Done status
3. ✅ Polls multiple times until completion
4. ✅ Times out after maxPolls
5. ✅ Handles fetch error gracefully — continues polling
6. ✅ Default maxPolls is 40
7. ✅ Calls correct PostgREST URL with apikey header
8. ✅ Empty response treated as non-completion

### Test Structure
- Uses Vitest with `vi.fn()` for fetch mocking
- Uses `pino({ level: 'silent' })` for logger
- All tests use `intervalMs: 0` for fast execution
- Proper beforeEach/afterEach cleanup
- `@ts-expect-error` comment for non-existent module

### Verification
```bash
npx vitest run tests/inngest/lib/poll-completion.test.ts
# Output: FAIL - module not found (expected)
# Duration: 219ms
```

### Next Step
T8: Implement `src/inngest/lib/poll-completion.ts` to make all 8 tests pass
