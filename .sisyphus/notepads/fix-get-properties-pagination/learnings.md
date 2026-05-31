## [2026-05-31T05:42] Task: init

### Root Cause
`get-properties.ts` line 79 uses `cursor=` but Hostfully API requires `_cursor=` (underscore prefix).
This causes page 1 to repeat, dedup logic stops, only 20/45 properties returned.

### Audit Results
- `get-properties.ts:79` — BUG (`cursor=`)
- `get-reservations.ts:169` — CORRECT (`_cursor=`)
- `get-messages.ts:315` — CORRECT (`_cursor=`)

### Key Constants
- Hostfully API Key: Y6EQ7KgSwoOGCokD
- Agency UID: 942d08d9-82bb-4fd3-9091-ca0c6b50b578
- Expected property count after fix: 45 (3 pages of 20/20/5)
- Archetype ID: 00000000-0000-0000-0000-000000000019
- Tenant ID: 00000000-0000-0000-0000-000000000003 (VLRE)
- Slack channel: C0B71QSMZKQ

### Expected May 31 Checkouts (8 total)
1. 3420-HOV-3 — Caroline Liu
2. 4403S-HAY-HOME — Kimberly Villarreal
3. 7213-NUT-3 — Daniel Valdez
4. 5306A-KIN-Home — Aidan Trinh
5. 7213-NUT-5 — Thomas Mcclelland
6. 7213-NUT-2 — Erick Baumgartner
7. 4403A-HAY-HOME — Miriam Avila
8. 6002-PAL-HOME — Carlos Alas

### Critical Guardrails
- NO Docker rebuild needed — src/worker-tools/ is bind-mounted in local Docker mode
- Do NOT touch get-reservations.ts or get-messages.ts
- Do NOT modify execution_steps preemptively (only if post-fix run still fails)
- Do NOT change loop termination logic (lines 95-104 of get-properties.ts)
- Skip unit tests (63 pre-existing failures, user decision)

## Run 8 — May 31, 2026 (Task 2 of fix-get-properties-pagination plan)

**Task ID**: `494b638e-47c1-4a9a-ba69-b3427e887fa2`
**Final Status**: `Failed`
**Failure Reason**: `Archetype missing delivery_instructions`

### What happened
- Worker executed successfully for ~10 minutes
- 411k prompt tokens, $0.13 cost — suggests it processed all 45 properties (pagination fix working)
- Lifecycle reached `Delivering` stage but failed immediately
- Root cause: `delivery_instructions` and `delivery_steps` are NULL on archetype `00000000-0000-0000-0000-000000000019`

### Key Finding
The cleaning-schedule archetype is missing `delivery_instructions` and `delivery_steps`.
These fields are required for the delivery container to run. Without them, the lifecycle
fails at the Delivering stage with "Archetype missing delivery_instructions".

### Next Step Required
The archetype needs `delivery_instructions` and `delivery_steps` populated before the
employee can complete successfully. This is a separate issue from the pagination fix.
