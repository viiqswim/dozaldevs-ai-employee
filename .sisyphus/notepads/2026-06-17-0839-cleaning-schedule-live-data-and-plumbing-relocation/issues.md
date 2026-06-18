
---
## [2026-06-17 19:33] F3 Real Live QA — VERDICT: REJECT (3/5 dates correct)

**Archetype:** cleaning-schedule-f3 (bb654f41-707b-4e27-b8d7-16e010ecf3cd), VLRE tenant. Generated fresh via converse-create (2-turn, plain-English desc).

**HARD GATES on generated stored steps: ALL PASS** — no-plumbing (execution_steps clean of printenv/node -e/getUTCDay/tsx /tools/), {{target_date}} x4, all 3 real page IDs, no fictional db names, no hardcoded business data (no cleaner names/ZIP allowlist/time tables). The lone submit-output token is in delivery_steps only = platform canonical DEFAULT_DELIVERY_INSTRUCTIONS contract, not a leak.

**Live-fetch PROVEN (Y):** compiled_agents_md for 06-22 & 06-28 show literal dates with 0 remaining {{ }} and no plumbing. Run-logs show `tsx /tools/hostfully/get-checkouts.ts --date 2026-06-22` and `tsx /tools/composio/execute.ts --action NOTION_GET_PAGE_MARKDOWN --params '{"page_id":"370d540b438080ca8676e61856488960"}'` — all 3 Notion pages fetched 4x each. All deliverable business data comes from live Notion, not stored steps.

**All 5 tasks reached Done.**

**FAILING dates (root cause = assignment-logic gap, NOT plumbing/substitution):**
- 06-20: Yessica capped correctly at 190m≤240m, but overflow 4403 Hayride A/B/S → UNASSIGNED "excede capacidad" instead of Berenice/Susana backup. Also fabricated a Diana "Habitación 1" not in checkouts.
- 06-28: 3505 Banton (78722) UNASSIGNED correct, but 4403/4405 Hayride → UNASSIGNED "no disponible domingo" instead of Berenice/Susana weekend backup.

The employee identifies primary cleaner + enforces working-day/capacity limits, but NEVER falls back to the weekend/overflow backup cleaners the Notion roster defines. Two of three critical-date checks fail on this same gap.

**PASSING dates:** 06-15 ✅, 06-22 ✅ (6002 Palm Circle 78741 UNASSIGNED — critical check pass), 07-04 ✅.

**Task IDs:** 06-15=9dfb7017 | 06-20=b935949b | 06-22=51f8086f | 06-28=40659a31 | 07-04=6f7a5aa3

Evidence: .sisyphus/evidence2/final-qa/f3-summary.md
