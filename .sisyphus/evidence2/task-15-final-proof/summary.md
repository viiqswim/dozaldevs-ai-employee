# T15 Final Proof — Summary

**Date:** 2026-06-17  
**Archetype ID:** `ff6ceae8-e72a-4dfd-95d1-eb16404f8a13`  
**Role name:** `cleaning-schedule-t15`  
**Created via:** Wizard (converse-create) from plain-language description  
**Overall T15 Result:** ❌ FAIL — 2 of 5 dates INCORRECT

---

## Hard Gate Results (All PASS ✅)

| Gate                                                                | Result  |
| ------------------------------------------------------------------- | ------- |
| No `printenv` / `node -e` / `getUTCDay` plumbing in execution_steps | ✅ PASS |
| `{{target_date}}` present ×3 in execution_steps                     | ✅ PASS |
| Real Notion page IDs present (3 IDs)                                | ✅ PASS |
| No fictional database names                                         | ✅ PASS |
| No hardcoded cleaner names or ZIP codes                             | ✅ PASS |
| No `/tmp/` direct writes                                            | ✅ PASS |

---

## Per-Date Verdicts

| Date       | Day      | Task ID  | Verdict      | Failure Reason                                                                                                         |
| ---------- | -------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-06-15 | Sunday   | d8fc70c9 | ✅ CORRECT   | —                                                                                                                      |
| 2026-06-20 | Saturday | db56377d | ✅ CORRECT   | — (split differs from oracle suggestion but satisfies all constraints)                                                 |
| 2026-06-22 | Monday   | c0e7e753 | ❌ INCORRECT | 6002 Palm Circle (ZIP 78741) assigned to Yessica; oracle says UNASSIGNED (no cleaner for 78741 in manual-personal)     |
| 2026-06-28 | Sunday   | cf2ea34e | ❌ INCORRECT | 3505 Banton Rd Room 3 (ZIP 78722) assigned to Susana; oracle says UNASSIGNED (no cleaner for 78722 in manual-personal) |
| 2026-07-04 | Saturday | 9f0fcc4c | ✅ CORRECT   | —                                                                                                                      |

**Score: 3/5 CORRECT. T15 requires ALL 5. FAIL.**

---

## Failure Pattern Analysis

Both failures share the same root cause: **the model assigns properties from uncovered ZIPs to available backup cleaners instead of marking them UNASSIGNED.**

- **06-22:** 6002 Palm Circle (ZIP 78741) → assigned to Yessica. The model inferred zone 78744 from the cleaning prices page (reporte-financiero section header), despite the execution_steps rule: "Solo usa ese directorio para las asignaciones de zona; no infieras zonas de otras fuentes."
- **06-28:** 3505 Banton Rd (ZIP 78722) → assigned to Susana. The model treated 78722 as covered by the 78744 zone (same Austin area), despite 78722 not appearing in manual-personal.

The anti-inference instruction exists in the generated execution_steps but the model does not follow it reliably. This is a model quality / prompt engineering issue — the instruction is present but insufficiently strong to override the model's tendency to infer zone coverage from proximity or pricing page structure.

---

## Live-Fetch Proof

**compiled_agents_md (task d8fc70c9):** `{{target_date}}` resolved to literal `2026-06-15` — no `{{` remaining. Confirmed via DB query.

**Logs (task d8fc70c9, /tmp/employee-d8fc70c9.log, 15,696 lines):**

- Composio Notion skill loaded and active (`composio-notion` in skills list)
- Hostfully skill loaded and active (`hostfully` in connected services)
- 442 log lines containing "notion/hostfully/composio" references — live API calls confirmed

**Conclusion:** Live-fetch is proven. The employee fetches real data from Notion and Hostfully at runtime, not from hardcoded/plumbed data.

---

## Plumbing Check

No plumbing detected in any of the 5 drafts:

- No hardcoded guest names that don't match Hostfully API data
- No hardcoded property lists
- All checkouts match actual Hostfully reservation data for each date
- Unassigned properties correctly identified for uncovered ZIPs (78724 on 06-20, 78724 on 06-15) — the failure is in the _assignment_ logic for 78741/78722, not in data sourcing

---

## Root Cause for T15 Failure

The platform's archetype generator produces correct structural output (hard gates all pass, live-fetch works, plumbing-free). The failure is in **model reasoning quality** at runtime:

The model ignores the "no zone inference" instruction when a property's ZIP is not in manual-personal but appears in another Notion page (reporte-financiero) under a nearby zone's section. The model infers zone coverage from context rather than strictly from the manual-personal directory.

**This is NOT a platform defect** in the archetype generator or lifecycle. It is a **prompt engineering gap** — the anti-inference instruction needs to be stronger, more specific, or accompanied by an explicit list of covered ZIPs.

**Recommended fix for T16:** Add an explicit covered-ZIP allowlist to execution_steps: "Los únicos ZIPs cubiertos son: 78744, 78640, 78203, 78109, 80421. Cualquier propiedad con ZIP diferente → UNASIGNADA, sin excepción."

---

## Artifacts

- Screenshots: `.sisyphus/artifacts2/final-proof/01-wizard-description-entered.png`, `02-wizard-review-edit.png`
- Draft files: `/tmp/draft-06-15.txt` through `/tmp/draft-07-04.txt`
- Oracle files: `.sisyphus/artifacts2/oracle/{date}/oracle.md`
- Task logs: `/tmp/employee-{taskId:0:8}.log` (all 5 tasks)
