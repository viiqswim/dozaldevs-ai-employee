# iter-final3 Summary — 2026-06-17-1953

## Status: PASS — 5/5 deterministic

## Commit

`020f7ae7` — fix(archetype-generator): apply roster-defined backup/capacity fallback from live data; drop hardcode-calendar driver

## Archetype

- **ID**: `f2e8c798-41a0-4d36-9ef8-738b2606412c`
- **slug**: `cleaning-schedule-v24`
- **tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)
- **model**: `deepseek/deepseek-v4-flash`
- **vm_size**: `performance-1x`
- **status**: `active`
- **approval_required**: `false`
- **Created via**: 1-turn converse-create (description was >200 words with all required fields → direct proposal, no clarifying question)

## Fixes Applied

### FIX 2 — Calendar bullet in buildConverseSystemPromptPre (line ~575)

**Before**: `"hardcode the full calendar as a named table in execution_steps — do NOT read it from Notion at runtime."`
**After**: `"If the description itself explicitly states a fixed recurring schedule, write that stated schedule into the steps as a named rule. If the schedule lives in a reference source (Notion, spreadsheet, etc.), the employee must read it live from that source each run — never copy it into the steps as a hardcoded table."`

### FIX 1c — Closed-Allowlist Coverage Rule CRITICAL distinction (buildConverseSystemPromptPre ~line 527)

Added: `**CRITICAL distinction**: UNASSIGNED means the key has NO coverage in the roster at all (no primary, no backup). It does NOT mean "primary is off today" or "primary is over capacity" — those cases MUST use the roster-defined backup, not UNASSIGNED.`

### FIX 1 — Availability bullet + new Backup-Fallback Rule (buildConverseSystemPromptPre REFERENCE-DATA section)

- **Availability bullet**: Strengthened from "filter out unavailable team members" to "assign to roster-defined BACKUP instead; UNASSIGNED reserved for keys with NO coverage at all"
- **New Backup-Fallback Rule bullet**: Explicitly covers BOTH unavailability AND over-capacity scenarios; forbids UNASSIGNED when backup exists

## Test Results

- `golden-prompts.test.ts`: 3/3 ✅
- `archetype-generator-prompts.test.ts`: 60/60 ✅
- `generator-prompts-parity.test.ts`: 17/17 ✅ (includes 6 new grep-gate assertions)
- `pnpm lint`: clean ✅
- Forbidden phrase grep: 0 matches ✅

## HARD GATE Results (cleaning-schedule-v24)

- Gate 1 `{{target_date}}` present: ✅ (3 occurrences)
- Gate 2 zero plumbing: ✅
- Gate 3 real page IDs verbatim: ✅ (all 3)
- Gate 4 no hardcoded business data: ✅

## Oracle Scoring — Run 1

| Date        | Task ID    | Key Assertions                                                                  | Result |
| ----------- | ---------- | ------------------------------------------------------------------------------- | ------ |
| 06-15 (Mon) | `ee3a3275` | 78722→UNASSIGNED, 78744→Yessica, 78640→Diana                                    | ✅     |
| 06-20 (Sat) | `e8b98803` | Yessica=190min≤240, 4403 Hayride→Berenice (not UNASSIGNED), 78724→UNASSIGNED    | ✅     |
| 06-22 (Mon) | `3079a7c1` | 6002 Palm Circle (78741)→UNASSIGNED                                             | ✅     |
| 06-28 (Sun) | `4aab49a0` | 4403/4405 Hayride→Berenice (Yessica off Sunday), 3505 Banton (78722)→UNASSIGNED | ✅     |
| 07-04 (Sat) | `e204c0b4` | 4403 Hayride→Yessica (90min≤240min cap)                                         | ✅     |

**Score: 5/5**

## Determinism — Run 2 (06-20 + 06-28)

| Date        | Task ID    | Key Assertions                                             | Result    |
| ----------- | ---------- | ---------------------------------------------------------- | --------- |
| 06-20 (Sat) | `46910692` | Yessica=190min, 4403 Hayride→Berenice, 78724→UNASSIGNED    | ✅ STABLE |
| 06-28 (Sun) | `cb013b6a` | 4403/4405 Hayride→Berenice, 3505 Banton (78722)→UNASSIGNED | ✅ STABLE |

**Determinism: CONFIRMED**

## Root Cause Analysis

**F3 (backup-cleaner fallback)**: The `buildConverseSystemPromptPre` path had a weaker availability bullet that said "filter out unavailable team members" — which the model interpreted as "if primary unavailable, skip them → UNASSIGNED". The fix explicitly says "assign to roster-defined BACKUP instead; UNASSIGNED is reserved for keys with NO coverage at all". The new Backup-Fallback Rule bullet reinforces this for BOTH unavailability AND over-capacity.

**F1+F4 (hardcode-calendar driver)**: The Calendar bullet in `buildConverseSystemPromptPre` still contained `"hardcode the full calendar as a named table in execution_steps — do NOT read it from Notion at runtime."` This caused the model to embed business data (cleaner names, ZIP codes, capacity numbers) into generated steps. Replaced with the correct phrasing that distinguishes user-stated schedules (write into steps) vs. roster-sourced schedules (read live).

## Genericity Proof

The fixes are generic — no cleaning/ZIP/cleaner-specific language in any prompt change. The Backup-Fallback Rule uses abstract language ("covered key", "primary", "backup", "roster") applicable to any roster-style employee.
