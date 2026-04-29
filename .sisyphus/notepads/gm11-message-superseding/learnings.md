
## Task 7 — Guest Messaging Archetype Instructions

- The NEEDS_APPROVAL path uses `post-guest-approval.ts`, NOT `post-message.ts`
- `post-guest-approval.ts` outputs `{ ts, channel }` but NOT `conversationRef`
- Added instructions to append `conversationRef` (threadUid) to `/tmp/approval-message.json` after `post-guest-approval.ts` runs, using a node one-liner
- This enables the harness (Task 4) to read `conversationRef` from the JSON and store it in deliverable metadata
- The `--conversation-ref` flag on `post-message.ts` is for cases where `post-message.ts` is used directly (not `post-guest-approval.ts`)
- Seed runs cleanly; `pnpm build` exits 0
- Pre-existing LSP errors in seed.ts (`knowledgeBaseEntry` vs `knowledgeBase`) are unrelated to this task
