# T15 Final Proof v3 — Summary (FAIL)

**Date:** 2026-06-18  
**Archetype ID:** `8d83e102-427c-44be-89ca-c555f52fa791`  
**Role name:** `cleaning-schedule-final3`  
**Created via:** Wizard (converse-create, 1-turn direct proposal) from plain-language description  
**Generator commit:** 020f7ae7 (backup-fallback + removed hardcode-calendar driver)  
**Overall T15 Result:** ❌ FAIL — 3/5 dates CORRECT

---

## Description Used (Turn 1 — direct proposal, no clarifying question)

> "I need a daily cleaning schedule employee for our property management company. Every day it should check Hostfully for all properties that have guest checkouts that day, then look up three Notion pages: one has the cleaning times and prices for each property type (page ID 370d540b438080ca8676e61856488960), one has the cleaner roster with which cleaners cover which zones their availability by day of week their capacity and all assignment rules including backup cleaners for when the primary is unavailable or over capacity (page ID 370d540b438080969a72c16c20defc70), and one has the trash pickup schedule for each property (page ID 370d540b4380809a8ea0c11074f92abb). Using all that it should generate a complete cleaning schedule in Spanish: which cleaner handles which checkout how long it takes the cost and any trash reminders. When a primary cleaner is unavailable or over capacity it should assign to the backup cleaner from the roster. Only mark a property UNASSIGNED if no cleaner in the roster covers that zone at all. Post the schedule to Slack channel C0B71QSMZKQ. Triggered manually with a target_date input. No approval needed."

---

## Hard Gate Results (All 17 PASS ✅)

| Gate                                  | Result  |
| ------------------------------------- | ------- |
| No `printenv`                         | ✅ PASS |
| No `node -e`                          | ✅ PASS |
| No `getUTCDay`                        | ✅ PASS |
| No `tsx /tools/`                      | ✅ PASS |
| No `submit-output` in execution_steps | ✅ PASS |
| No `<approved-content>`               | ✅ PASS |
| No `/tmp/` direct writes              | ✅ PASS |
| `{{target_date}}` present             | ✅ PASS |
| All 3 Notion IDs present              | ✅ PASS |
| No fictional DB names                 | ✅ PASS |
| No hardcoded cleaner names            | ✅ PASS |
| No hardcoded ZIP list                 | ✅ PASS |
| No hardcoded capacity numbers         | ✅ PASS |
| CLOSED/covered-set language present   | ✅ PASS |
| Backup-fallback logic present         | ✅ PASS |
| DB: `has_hardcoded_zip=f`             | ✅ PASS |
| DB: `has_backup_logic=t`              | ✅ PASS |

---

## Per-Date Verdicts

| Date       | Day | Task ID                                | Verdict      | Notes                                                                                                                                             |
| ---------- | --- | -------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-15 | Mon | `801e883d-41c0-4e66-92da-850a6b606932` | ✅ CORRECT   | Diana→271 Gina Rm2; Yessica→7213 Nutria Rm1; 3505 Banton (78722) UNASSIGNED                                                                       |
| 2026-06-20 | Sat | `0bda4c61-23bd-4212-ab19-c5e8d3f6d8bd` | ✅ CORRECT   | Yessica 190/240min; Berenice→4403 A,B,S overflow backup; Diana exclusive; Zenaida 78203; 5306 King Charles (78724) UNASSIGNED                     |
| 2026-06-22 | Mon | `3e074fb3-adbf-44fd-920c-1ecac393d1d5` | ❌ INCORRECT | **6002 Palm Circle (78741) assigned to Yessica** — should be UNASSIGNED (78741 not in roster)                                                     |
| 2026-06-28 | Sun | `f08cf756-8717-4194-9a0f-8cef45ac6363` | ❌ INCORRECT | 4403/4405 Hayride → Berenice/Susana ✓ (backup correct); **3505 Banton (78722) assigned to Berenice** — should be UNASSIGNED (78722 not in roster) |
| 2026-07-04 | Sat | `d0634af4-c3ea-44c2-9071-7643ddbc8f4e` | ✅ CORRECT   | Yessica→4403 Hayride A (90min)                                                                                                                    |

**Score: 3/5. T15 v3 FAILS.**

---

## Backup-Fallback Check Results

| Check                                                  | Result                         |
| ------------------------------------------------------ | ------------------------------ |
| 06-20: Yessica ≤240min Saturday cap                    | ✅ PASS (190min)               |
| 06-20: 4403 Hayride A/B/S → Berenice backup (overflow) | ✅ PASS                        |
| 06-28: Yessica off Sunday                              | ✅ PASS (noted in draft)       |
| 06-28: 4403 Hayride A → Susana weekend backup          | ✅ PASS                        |
| 06-28: 4405 Hayride A → Berenice weekend backup        | ✅ PASS                        |
| 06-22: 6002 Palm Circle (78741) → UNASSIGNED           | ❌ FAIL (assigned to Yessica)  |
| 06-28: 3505 Banton (78722) → UNASSIGNED                | ❌ FAIL (assigned to Berenice) |

The backup-fallback logic itself works correctly (06-20 overflow, 06-28 Sunday backup). The failure is in the CLOSED allowlist enforcement — the model still groups 78741 and 78722 under nearby covered zones.

---

## Failure Analysis

**Same root cause as T15 v1:** The model groups nearby ZIPs under covered zones at runtime despite the CLOSED allowlist instruction. Specifically:

- **06-22:** Draft shows "Zonas cubiertas: 78744 y 78640" — model included 78741 under 78744 coverage (Austin area grouping)
- **06-28:** 3505 Banton Rd (78722) assigned to Berenice — model treated 78722 as covered by 78744 zone

The execution_steps say "Declare the complete set of covered zones aloud" and "If not, mark the property as UNASSIGNED" — but the model's zone-declaration step groups 78741/78722 with 78744 rather than treating them as separate uncovered ZIPs.

**Key insight:** The CLOSED allowlist instruction works when the model correctly reads the roster (which lists specific ZIPs). But the model is reading the roster and then grouping nearby ZIPs together based on geographic proximity or city name ("Austin"), rather than treating each ZIP as a distinct key requiring explicit roster membership.

**What T15 v2 had that v3 doesn't:** In T15 v2 (commit 763f41d8), the generator emitted Step 6 with explicit language: "This set is now CLOSED: only properties whose ZIP code is in this set can be assigned. Properties with ZIP codes not in this set must be marked UNASSIGNED." — The word "CLOSED" in all-caps and the explicit membership check language was stronger. In v3 (commit 020f7ae7), the generator produced "Declare the complete set of covered zones aloud" without the explicit CLOSED/membership-check language in the steps.

**Recommended fix for next T14 iteration:** The generator must emit the explicit CLOSED membership-check language in every generated employee that uses a roster-based zone assignment. The language from 763f41d8 was correct and should not have been weakened. Specifically, the step must say: "This set is CLOSED — a property is covered ONLY if its exact ZIP code appears in this set. Do NOT group nearby ZIPs together. Do NOT infer coverage from city name or geographic proximity."

---

## Live-Fetch Proof

**compiled_agents_md (task 801e883d, 06-15):**

- `{{` count = 0 (no unresolved placeholders)
- Literal `2026-06-15` appears 4× — placeholder resolved

**Logs (task 801e883d, /tmp/employee-801e883d.log, 8,404 lines):**

- 387 lines with notion/hostfully/composio references
- Notion and Hostfully tools confirmed active
- Live-fetch proven

---

## Comparison: v2 (PASS) vs v3 (FAIL)

| Aspect                         | v2 (PASS, 763f41d8)                                | v3 (FAIL, 020f7ae7)                                           |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------- |
| CLOSED keyword in steps        | ✅ "This set is now CLOSED"                        | ❌ Not present                                                |
| Explicit membership check      | ✅ "only properties whose ZIP code is in this set" | ❌ "Declare the complete set of covered zones aloud" (weaker) |
| 06-22 (78741)                  | ✅ UNASSIGNED                                      | ❌ Assigned to Yessica                                        |
| 06-28 (78722)                  | ✅ UNASSIGNED                                      | ❌ Assigned to Berenice                                       |
| Backup-fallback (06-20, 06-28) | ✅ Correct                                         | ✅ Correct                                                    |
| Score                          | 5/5                                                | 3/5                                                           |

The 020f7ae7 commit improved backup-fallback but regressed the CLOSED allowlist enforcement by weakening the language. The fix must restore the explicit CLOSED + membership-check language while keeping the backup-fallback improvements.
