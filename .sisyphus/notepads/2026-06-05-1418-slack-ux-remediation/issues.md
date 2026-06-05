# Issues — slack-ux-remediation

## [2026-06-05] Known Issues / Gotchas

- Do NOT touch `src/inngest/watchdog.ts` — that's the DEPRECATED engineering watchdog, different from `src/inngest/triggers/reviewing-watchdog.ts`
- Do NOT widen `resolveArchetypeFromChannel` SELECT shape in interaction-classifier.ts
- Do NOT re-fix strings already in a9e611a5 commit
- handlers.ts is ~1900 lines — B1/B2/B3 tasks must stay in their respective line regions to avoid conflicts
- Watchdog zombie case has NO pending_approvals row — only notify-received message to update

## [2026-06-05 16:15] Task 9 — PLAN GAP: rule-proposed copy in handlers.ts uncovered

- The 9-string grep in Task 9's EXPECTED OUTCOME wants ALL-ZERO across `src/`, but two hits remain at `src/gateway/slack/handlers.ts:1484` and `:1490` — the `RULE_REPHRASE` modal's `chat.update` re-render of the "🧠 *New behavioral rule proposed:*" card.
- These cannot be fixed by Task 9: its MUST-NOT explicitly says "Do NOT touch src/gateway/slack/handlers.ts (Tasks 3/5/6/7 own it)".
- Task 7 (B3, rule handlers, lines ~1138–1389) ALSO excludes this: plan line 470 says "Do NOT touch the rule-card PROPOSED copy here (that's Task 9, in rule-extractor.ts — different file)". The planner assumed the proposed-copy lived ONLY in rule-extractor.ts and missed the duplicate in handlers.ts.
- Net: handlers.ts:1484/1490 is an ORPHAN — owned by no task. Boundary (MUST-NOT touch file) was honored over the goal metric (ALL-ZERO), because the file is reserved for a parallel-safe wave.
- RECOMMENDATION for Atlas/final-wave: assign a one-line follow-up (or extend Task 7's scope) to replace handlers.ts:1484+1490 with `ruleProposedMessage(newText.trim())` (import from `../../lib/slack-copy.js`). Trivial, but must be done in the handlers.ts-owning wave to avoid merge thrash.
