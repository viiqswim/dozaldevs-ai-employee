# Learnings

## [2026-06-08] Task 1 (AGENTS.md surgery) — completed despite earlier abort
- The aborted Task 1 delegation actually landed all edits before interruption. Verified post-hoc.
- Durability convention at AGENTS.md:392 "### Documentation Durability (MANDATORY)" — Principle/Forbidden/Durable-instead/Allowed-exception/one-question heuristic.
- The string "14-model" still appears ONCE at line 398 — but that is INSIDE the forbidden-examples list (a quoted bad example). Correct, not a violation. Brittle-sweep (Task 5) must whitelist matches inside the durability convention itself.
- Trigger lanes de-overlapped: prisma=schema/migration/seed only; data-access=runtime DB/env/HTTP (no "Inngest function"); security narrowed (no bare "input validation").
- Worker-only skills labeled "(worker container only)".
