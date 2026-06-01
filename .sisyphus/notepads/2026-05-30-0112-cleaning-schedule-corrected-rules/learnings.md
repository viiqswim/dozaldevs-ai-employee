# Learnings

## [2026-05-30T06:23:47Z] Session Start: ses_18aab566bffe6yLQjmsyNfzUwQ

### Confirmed Business Rules (all user-approved)

- **Check-In Billing Rule**: Billing based on check-ins, NOT check-outs. If checkout with no check-in → prepare as rooms.
- **Home+Loft (407 S Gevers)**: SEPARATE physical units — always charge both individually.
- **45-min travel overhead**: ONLY for ZIPs 78744/78640, ONLY when NO cleanings scheduled (trash-only days). 45 min = round-trip. 271 Gina is NOT an exception.
- **Backup threshold**: 7 hours (420 min)
- **Route priority**: 3420 Hovenweep → first slot when it has a checkout (10AM checkout priority)
- **Trash skip**: 5306 King Charles (owners handle), 219 Paul St (bin always on street)
- **Trash reminders**: 1 day before for 78744/78640; 2+1 days before for 78203/78109
- **Inactive**: 4402 McKinney Falls (skip if encountered)

### Notion Page IDs (NEW — use these)

- `370d540b4380809a8ea0c11074f92abb` → Directorio Operativo → fixture: `directorio-operativo`
- `370d540b438080969a72c16c20defc70` → Manual de Personal → fixture: `manual-personal`
- `370d540b438080ca8676e61856488960` → Reporte Financiero → fixture: `reporte-financiero`

### Old Fixtures to Delete

- `cleaning-zones.json` (old)
- `trash-schedule.json` (old)
- `default.json` (stale duplicate — MUST DELETE)

### Decryption Info

- ENCRYPTION_KEY: in `.env` as `ENCRYPTION_KEY`
- Token stored in `tenant_secrets` table for tenant `00000000-0000-0000-0000-000000000003`, key `notion_access_token`
- Decrypted token: [REDACTED]

### Critical Constraint

- `get-page.ts` mock mode does NOT recurse into `has_children` blocks — fixtures must flatten ALL nested children as top-level blocks
- Every `get-page.ts` call MUST have explicit `--fixture <name>` — `default.json` is being deleted
- MUST NOT run `pnpm prisma db seed` — use SQL UPDATE only
- MUST NOT change `risk_model`, `tool_registry`, `input_schema`, `delivery_steps`, `delivery_instructions`
- MUST NOT hardcode costs in execution_steps — costs come from Reporte Financiero at runtime

### Key Constants

- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- Archetype ID: `00000000-0000-0000-0000-000000000019`
- Slack channel: `C0B71QSMZKQ`
- Test model: `deepseek/deepseek-v4-flash` (override for T4)
- Production model: `minimax/minimax-m2.7` (restore after T4)

## [2026-05-30] Task 2: execution_steps + identity rewritten

- Both create (lines ~3523-3609) and update (lines ~3647-3733) blocks updated identically
- Old page IDs (36fd540b): 0 remaining
- New page IDs (370d540b):
  - directorio-operativo (370d540b4380809a8ea0c11074f92abb): 2
  - manual-personal (370d540b438080969a72c16c20defc70): 2
  - reporte-financiero (370d540b438080ca8676e61856488960): 2
- All 6 actual tsx invocations of get-page.ts have --fixture flag (tool_registry path entries don't need --fixture)
- Check-In Billing Rule: present (2 occurrences)
- "Golden Rule" string appears 2x but only inside new rule text: "replaces all previous 'Golden Rule' logic" — intentional
- Forbidden fields changed: none (risk_model, tool_registry, input_schema, delivery_steps, delivery_instructions all unchanged)
- Hovenweep route priority: 8 occurrences
- King Charles trash skip: 3 occurrences
- Paul St trash skip: 5 occurrences
- 7-hour backup threshold: 6 occurrences
- 45-min travel overhead: 2 occurrences
- CHECK-IN/CHECK-OUT labels added to output format in STEP 4
- Evidence saved to: .sisyphus/evidence/task-2-\*.txt

## [2026-05-30] Task 3: DB Update Applied

- Backup: /tmp/cleaning-schedule-archetype-backup-v2.sql (853 lines)
- UPDATE applied to archetype 00000000-0000-0000-0000-000000000019 → UPDATE 1
- New page IDs verified in DB: yes (all 3 present: directorio, manual, reporte)
- Old page IDs gone from DB: yes (0 occurrences of 36fd540b)
- Check-In Billing Rule in DB: yes (1 match)
- Evidence: .sisyphus/evidence/task-3-db-verified.txt, task-3-backup-verified.txt
- Method: PostgreSQL dollar-quoting ($EXEC_TAG$...$EXEC_TAG$) to safely embed multiline strings
- Note: host pg_dump fails (version mismatch 15 vs 17) — use `docker exec shared-postgres pg_dump` instead

## [2026-05-30] Task 1: Fixtures Created

- Created: directorio-operativo.json, manual-personal.json, reporte-financiero.json
- Deleted: cleaning-zones.json, trash-schedule.json, default.json
- Block counts: Directorio=57 (top-level after flattening), Manual=21, Reporte=23
- Flattening needed: ALL property entries in Directorio Operativo had has_children: true (each had 2-3 child blocks for units and trash schedule). Manual de Personal had 2 blocks with children (Tiempos Extra and Reglas de Basura).
- Reporte Financiero had NO nested children — all blocks were flat.
- Verified content matches expected post-fix values:
  - Sand Dunes = 180 min ✓
  - Hayride 4403 = 90 min ✓
  - Hayride 4405 = 90 min ✓
  - Nutria Room 5 = $40 ✓
  - 271 Gina Dr entry present ✓
  - Manual: "Regla de Cobro (Check-In)" ✓ (not "Regla de Oro")
  - Manual: "Si no hay check-ins ni limpiezas programadas" + 45 min ✓
  - Manual: "7 horas diarias" ✓
  - Directorio: Hovenweep has "⏰ Check-out: 10:00 AM (Prioridad de Ruta)" ✓
