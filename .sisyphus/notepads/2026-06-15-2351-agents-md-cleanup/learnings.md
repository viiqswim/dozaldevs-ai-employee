## Task 5 — Stub & deprecated-table removal (2026-06-16)
- AGENTS.md 769->726 lines (net -43; 15 ins / 58 del).
- Removed `## Deprecated Components` (7-row table) -> one-line note: "The engineering employee and its orchestrator-based worker are retired; all active employees use the OpenCode harness."
- Removed 11 `[Moved to skill]` stubs. 10 used `[Moved to skill]` (singular) + 1 (`## Known Issues`) used `[Moved to skills]` (plural). grep '\[Moved to skill' catches both.
- Inserted single `## Detailed Topics -> Skills` index table immediately before `## Feedback Pipeline`.
- All 7 referenced skills resolve under `.opencode/skills/`: slack-conventions, api-design, production-ops, long-running-commands, debugging-lifecycle, feature-verification, inngest.
- Technique: anchor-based byte-exact Python regex/replace with `assert count==1` per edit (safe-fail vs transcribing the giant padded table into Edit oldStrings). Temp script written to .sisyphus/, run, deleted — never committed.
- GOTCHA: `python3` is intercepted by asdf shim (no version set) -> use `/usr/bin/python3` directly.
- `## Feature Verification Checklist` stub sat between two `---` rules; removing it left exactly one `---` separator intact between Prometheus and Post-Implementation sections (verified clean).

## Task 6 — Volatile facts, workers/lib, dedup, prune (2026-06-16)
- AGENTS.md 726->721 lines (net -5; 12 ins / 17 del).
- Fix 1: "and 11 others (see go-models.ts)" -> "and others (see go-models.ts for the full list)". Count was volatile (list has 14 total; 3 named + 11).
- Fix 2: Added 12 missing workers/lib files to § Project Structure lib line. Verified each via `ls src/workers/lib/` + read each file header for an accurate 1-line role. session-manager.ts was ALSO missing from the old list (not in the task-6 required-12 but present on disk) — added it too. Enumerated, no count asserted.
- Fix 3: "Rebuild after every worker change" — kept § Infrastructure occurrence (richer: also mentions tsx watch + gateway), removed § OpenCode Worker bullet. Now exactly 1.
- Fix 4: Slack routing mechanics — kept full algorithm in § OpenCode Worker, replaced § Tenants prose with pointer "(see § OpenCode Worker → Slack @mention triggering...)".
- Fix 5: Removed 4 Reference Documents rows (worker-agent-delegation-redesign, feedback-pipeline-e2e-test-guide [MISSING on disk], platform-settings-table plan, conversational-employee-editing plan). Remaining 33 paths all resolve (matches Task-3 audit keep=33).
- GOTCHA: a broad grep for the 4 pruned slugs still matched 1 line (665) — but that is the SEPARATE "Plan E2E Validation" guides table (Scenarios A–F column), NOT the Reference Documents table (starts line 683). feedback-pipeline-e2e-test-guide.md is referenced in BOTH tables; Task 6 scope is Reference Documents ONLY. Scope grep with `awk 'NR>=683'` to avoid false positive.
- PRE-EXISTING working-tree change observed: "Detailed Topics → Skills" table got whitespace-only column re-alignment (content-identical). NOT introduced by my exact-string Edits — was already staged in the tree from a prior task. Confirmed content-identical via grep of +/- header lines.
- Durability self-demo examples all survived verbatim: "Active Functions (7)", "14-model Go list", "84 lines", "58 stories", "1490 passing, 27 skipped". Semantic constants intact: 5/8000/32000/1.14.31.
