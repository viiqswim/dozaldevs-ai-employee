
## Task 3 — Seed instruction update

- `leadUid` is on the **thread object** (top-level array item from `get-messages.ts`), not on individual message objects within a thread
- The instruction in `VLRE_GUEST_MESSAGING_INSTRUCTIONS` at line ~318 was updated from "message objects" → "each thread object" to match the actual JSON structure
- `pnpm prisma db seed` is idempotent (upsert pattern) — safe to re-run without side effects
- DB verification: grep the psql output for the new phrase to confirm the upsert landed
