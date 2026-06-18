# T15 Final Proof v2 — Summary (PASS)

**Date:** 2026-06-18  
**Archetype ID:** `526d304f-be84-46da-b6bb-b782810cf95a`  
**Role name:** `cleaning-schedule-final2`  
**Created via:** Wizard (converse-create, 2-turn) from plain-language description  
**Generator commit:** 763f41d8 (Closed-Allowlist Coverage Rule)  
**Overall T15 Result:** ✅ PASS — 5/5 dates CORRECT

---

## Description Used (Turn 1)

> "I need a daily cleaning schedule employee for our property management company. Every day, it should check Hostfully for all properties that have guest checkouts that day, then look up three Notion pages to get the information it needs: one page has the trash pickup schedule for each property (page ID 370d540b4380809a8ea0c11074f92abb), another has the cleaning times and prices for each property type (page ID 370d540b438080ca8676e61856488960), and the third has the cleaner roster which cleaners cover which zones their availability by day of week and all the assignment rules like capacity limits backup cleaners for weekends and which properties are exclusive to certain cleaners (page ID 370d540b438080969a72c16c20defc70). Using all that information it should generate a complete cleaning schedule in Spanish: which cleaner handles which checkout how long it will take the cost and any trash reminder notifications for that day. It should post the schedule to Slack channel C0B71QSMZKQ. It is triggered manually with a target_date input. No approval needed just post directly."

## Clarifying Question (Turn 1 response)

> "You mentioned the cleaner roster page includes capacity limits, backup cleaners, and exclusive properties. Could you clarify the structure of that page? For example, how are zones, cleaners, and their assignments organized?"

## Answer (Turn 2)

> "The cleaner roster page lists each cleaner by name with their zone (ZIP codes they cover), their availability by day of week, their daily capacity in minutes, and any special rules like which properties they are exclusively assigned to. It also lists backup cleaners for each zone and which days they are available. The employee should read that page as-is and derive the covered zones directly from the roster — whatever zones appear in the roster are the covered zones, and any property whose zone is not in the roster should be marked as unassigned."

---

## Hard Gate Results (All 16 PASS ✅)

| Gate                                                        | Result  |
| ----------------------------------------------------------- | ------- |
| No `printenv`                                               | ✅ PASS |
| No `node -e`                                                | ✅ PASS |
| No `getUTCDay`                                              | ✅ PASS |
| No `tsx /tools/`                                            | ✅ PASS |
| No `submit-output` in execution_steps                       | ✅ PASS |
| No `<approved-content>`                                     | ✅ PASS |
| No `/tmp/` direct writes                                    | ✅ PASS |
| `{{target_date}}` present                                   | ✅ PASS |
| Notion ID `370d540b4380809a8ea0c11074f92abb` present        | ✅ PASS |
| Notion ID `370d540b438080ca8676e61856488960` present        | ✅ PASS |
| Notion ID `370d540b438080969a72c16c20defc70` present        | ✅ PASS |
| No fictional DB names                                       | ✅ PASS |
| No hardcoded cleaner names                                  | ✅ PASS |
| **No hardcoded ZIP allowlist** (78744, 78640, etc.)         | ✅ PASS |
| **CLOSED allowlist language present** (derive from roster)  | ✅ PASS |
| DB confirms: `has_hardcoded_zip=f`, `has_closed_language=t` | ✅ PASS |

**Critical gate (new in v2):** The generated execution_steps contain Step 6: "Declare the complete set of covered ZIP codes from the roster. This set is now CLOSED: only properties whose ZIP code is in this set can be assigned. Properties with ZIP codes not in this set must be marked UNASSIGNED." — No hardcoded ZIP list; derived from live roster at runtime.

---

## Per-Date Verdicts

| Date       | Day | Task ID                                | Verdict    | Key Evidence                                                                                                |
| ---------- | --- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-06-15 | Mon | `a84ce58f-2a20-4ae4-b482-cc6c8bb2ef56` | ✅ CORRECT | Diana→271 Gina Rm2; Yessica→7213 Nutria Rm1; 3505 Banton (78722) UNASSIGNED                                 |
| 2026-06-20 | Sat | `6a5268de-de9d-41f4-9b91-1185bb04fda0` | ✅ CORRECT | Yessica 190/240min; Berenice overflow; Diana exclusive; Zenaida 78203; 5306 King Charles (78724) UNASSIGNED |
| 2026-06-22 | Mon | `8f869089-51b5-494f-a57d-7b8b85eea815` | ✅ CORRECT | **6002 Palm Circle (78741) → UNASSIGNED** "Código postal 78741 no cubierto"                                 |
| 2026-06-28 | Sun | `f97e28e7-7ff1-4b13-8363-9eac0fc61e8f` | ✅ CORRECT | **3505 Banton (78722) → UNASSIGNED**; Berenice→4403 Hayride A; Susana→4405 Hayride A                        |
| 2026-07-04 | Sat | `a5202d41-0c21-4270-b894-be96f5a986ec` | ✅ CORRECT | Yessica→4403 Hayride A (90min, 37.5% capacity)                                                              |

**Score: 5/5 CORRECT. T15 PASSES.**

---

## Critical Dates — Exact Draft Evidence

### 06-22: 6002 Palm Circle (78741) — Previously INCORRECT in T15 v1, now CORRECT

```
❌ PROPIEDADES NO ASIGNADAS
1. 6002 Palm Circle (6002-PAL-HOME) — Austin, TX 78741
   MOTIVO: Código postal 78741 no cubierto por ningún limpiador
```

### 06-28: 3505 Banton Rd (78722) — Previously INCORRECT in T15 v1, now CORRECT

```
❌ PROPIEDADES NO ASIGNADAS
3. 3505 Banton Rd — Habitación 3 (78722)
   Motivo: Código postal 78722 no cubierto por ningún limpiador en el roster
```

---

## Live-Fetch Proof

**compiled_agents_md (task a84ce58f, 06-15):**

- `{{` count in compiled_agents_md = **0** (no unresolved placeholders)
- Literal `2026-06-15` appears 3× in compiled_agents_md — placeholder resolved

**compiled_agents_md (task 8f869089, 06-22):**

- Literal `2026-06-22` appears 3× in compiled_agents_md — placeholder resolved

**Logs (task a84ce58f, /tmp/employee-a84ce58f.log, 9,611 lines):**

- 397 lines containing notion/hostfully/composio references
- `composio-notion` skill loaded and active
- `hostfully` connected service confirmed active
- Live API calls to Notion (3 pages) and Hostfully (get-checkouts) confirmed

**Conclusion:** Live-fetch proven. Employee fetches real data from Notion and Hostfully at runtime. No hardcoded/plumbed data.

---

## Plumbing Check

No plumbing detected in any of the 5 drafts:

- Guest names match actual Hostfully reservation data (Evan Chapman, P Rubio, Jossy May, Kylan White, Bianca Lopez, Hasel Churon, Laurie Rotondo)
- Property lists derived from live Hostfully checkouts per date
- Cleaner assignments derived from live Notion roster
- UNASSIGNED properties correctly identified via CLOSED allowlist derived from roster

---

## What Changed from T15 v1 → v2

| Aspect                      | T15 v1 (FAIL)                   | T15 v2 (PASS)                        |
| --------------------------- | ------------------------------- | ------------------------------------ |
| Generator commit            | pre-763f41d8                    | 763f41d8                             |
| ZIP coverage rule           | Weak anti-inference instruction | CLOSED allowlist derived from roster |
| Hardcoded ZIP list in steps | No                              | No (derived at runtime)              |
| 06-22 (78741)               | ❌ Assigned to Yessica          | ✅ UNASSIGNED                        |
| 06-28 (78722)               | ❌ Assigned to Susana           | ✅ UNASSIGNED                        |
| Score                       | 3/5                             | 5/5                                  |

---

## Artifacts

- Screenshots: `.sisyphus/artifacts2/final-proof/01-wizard-description-entered-v2.png`
- Draft files: `/tmp/draft2-06-15.txt` through `/tmp/draft2-07-04.txt`
- Oracle files: `.sisyphus/artifacts2/oracle/{date}/oracle.md`
- Task logs: `/tmp/employee-a84ce58f.log`, `/tmp/employee-8f869089.log`
- Converse-create responses: `/tmp/converse-turn1.json`, `/tmp/converse-turn2.json`
