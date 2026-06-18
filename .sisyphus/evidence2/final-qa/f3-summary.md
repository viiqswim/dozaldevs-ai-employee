# F3 — Real Live QA: 5-Date Replay + Live-Fetch Proof

**Plan:** 2026-06-17-0839-cleaning-schedule-live-data-and-plumbing-relocation
**Run date:** 2026-06-18 (UTC)
**Method:** Clean-slate independent reproduction. Fresh employee generated from a SIMPLE plain-English description via converse-create (2-turn), inserted as a brand-new archetype, triggered live on all 5 pinned dates, judged against Hostfully-derived oracles.

---

## VERDICT LINE

`Dates [3/5 correct] | Live-fetch proven [Y] | All Done [Y] | No-plumbing gate [P] | VERDICT: REJECT`

---

## Why REJECT

The generator/platform hardening **succeeded** on every structural goal: a simple plain-language description produced clean, no-plumbing execution steps with live Notion + Hostfully fetches and correct `{{target_date}}` substitution. **However, the employee is only correct on 3 of 5 pinned dates.** Two of the three explicitly-called-out critical-date checks FAIL:

- **2026-06-20** — overflow was NOT assigned to a backup cleaner (required: Berenice/Susana). It was dumped to UNASSIGNED "excede capacidad".
- **2026-06-28** — 4403/4405 Hayride were NOT assigned to weekend backup (required: Berenice/Susana). They were dumped to UNASSIGNED "no disponible en domingo".

Per F3 instructions: "ALL 5 must be CORRECT" and a failed date "is a REJECT — report it." 3/5 → **REJECT**.

The root cause is a **reasoning/assignment-logic gap, not a plumbing or substitution gap**: the employee correctly identifies the primary cleaner and correctly enforces working-day and capacity limits, but it never falls back to the weekend/overflow backup cleaners that the source Notion roster defines. The hardening objectives (live data, no leaked plumbing, no hardcoded business data, date parameterization) are all met — the employee's day-to-day correctness is not.

---

## Artifacts

- **Archetype:** `cleaning-schedule-f3` — id `bb654f41-707b-4e27-b8d7-16e010ecf3cd`
- **Tenant:** VLRE `00000000-0000-0000-0000-000000000003`
- **Config:** vm_size=`performance-1x`, model=`deepseek/deepseek-v4-flash`, status=`active`, risk_model=`{"approval_required": false}`, input_schema=`target_date` (date), notification_channel=`C0B71QSMZKQ`
- **tool_registry:** `/tools/hostfully/get-checkouts.ts`, `/tools/composio/execute.ts`, `/tools/slack/post-message.ts`, `/tools/platform/submit-output.ts`

---

## Pre-flight

- `set -a; source .env; set +a` — OK (a benign `.env:96` parse warning; SERVICE_TOKEN loaded, len 64)
- Single gateway on :7700 — `lsof -nP -i:7700 | grep LISTEN | wc -l` = **1** ✅
- `curl localhost:7700/health` → `{"status":"ok"}` ✅

---

## Generation (converse-create, 2-turn)

- **Turn 1** (short desc) → `kind: question` ("How do you determine which cleaner… reference document or database (Notion)?") — clarify-then-act confirmed ✅
- **Turn 2** (full transcript + plain answer with page IDs / Slack channel / Spanish / manual+target_date / no approval) → `kind: proposal` ✅
- Generated `role_name: daily-cleaning-schedule`, `risk_model {approval_required:false}`, `trigger_sources {manual}`, `input_schema [target_date date]`.

---

## HARD GATES (on GENERATED stored steps, post-INSERT)

| Gate                          | Result      | Evidence                                                                                                                 |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| No-plumbing (execution_steps) | **PASS ✅** | Zero printenv / node -e / getUTCDay / `tsx /tools/` / submit-output / `<approved-content>` / `/tmp/` in execution_steps. |
| `{{target_date}}` present     | **PASS ✅** | 4 occurrences in stored steps.                                                                                           |
| Real page IDs present         | **PASS ✅** | All 3 (370d…8960, 370d…fc70, 370d…2abb) in stored steps.                                                                 |
| No fictional db names         | **PASS ✅** | No directorio-operativo / manual-personal / reporte-financiero / \*\_db.                                                 |
| No hardcoded business data    | **PASS ✅** | No cleaner names, no literal ZIP allowlist, no time/price tables in steps.                                               |

**Note on the lone `submit-output` token:** It appears only in `delivery_steps` ("Confirm delivery by submitting output via submit-output…"), which is the platform's canonical delivery contract — the platform's own `DEFAULT_DELIVERY_INSTRUCTIONS` constant (`src/lib/output-contract-constants.ts`) literally contains "submit-output" and "/tmp/summary.txt" by design. It is NOT in the generated execution_steps. The no-plumbing gate (scoped to generated procedural execution_steps) PASSES.

---

## 5-Date Replay (fresh task IDs, one burst, all polled to Done)

| Date             | Task ID                                | Status | Verdict          | Key check                                                                                                                                                                                                                |
| ---------------- | -------------------------------------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-15 (Mon) | `9dfb7017-20fe-4397-9ae1-660f69ac7d28` | Done   | **CORRECT ✅**   | Diana→271 Gina R2 (25m); 3505 Banton ×3 UNASSIGNED (78722); Yessica→7213 R1 (25m). Matches oracle.                                                                                                                       |
| 2026-06-20 (Sat) | `b935949b-be87-41f5-b6f2-18261ec7611e` | Done   | **INCORRECT ❌** | Yessica capped at 190m ≤240m ✅, BUT overflow (4403 Hayride A/B/S) → UNASSIGNED "excede capacidad" instead of **Berenice/Susana backup**. Critical check FAILS. Also fabricated Diana "Habitación 1" (not in checkouts). |
| 2026-06-22 (Mon) | `51f8086f-4135-4fb3-8d90-43a1853b6d06` | Done   | **CORRECT ✅**   | 6002 Palm Circle (78741) UNASSIGNED "ZIP 78741 no está en el directorio" ✅. Critical check PASSES.                                                                                                                      |
| 2026-06-28 (Sun) | `40659a31-f4dc-40ce-ade6-268ffa65bf0f` | Done   | **INCORRECT ❌** | 3505 Banton (78722) UNASSIGNED ✅, BUT 4403/4405 Hayride → UNASSIGNED "no disponible en domingo" instead of **Berenice/Susana weekend backup**. Critical check FAILS.                                                    |
| 2026-07-04 (Sat) | `6f7a5aa3-110e-4ade-982e-24e3ee60af07` | Done   | **CORRECT ✅**   | Yessica→4403 Hayride Unit A (90m), within Sat 240m window. Matches oracle.                                                                                                                                               |

**Tally: 3/5 CORRECT. All 5 reached Done.**

### Critical-check scorecard (per F3 instructions)

- 06-22 → 6002 Palm Circle (78741) UNASSIGNED — **PASS ✅**
- 06-28 → 3505 Banton (78722) UNASSIGNED **AND** 4403/4405 Hayride → Berenice/Susana weekend backup — **PARTIAL/FAIL ❌** (Banton correct; Hayride backup missing)
- 06-20 → Yessica ≤240m Saturday cap + overflow assigned to a backup — **PARTIAL/FAIL ❌** (cap correct; overflow→backup missing)

---

## Live-Fetch Proof (PROVEN — Y)

### Proof 1 — `compiled_agents_md` substitution (tasks 06-22 and 06-28)

- 06-22 (`51f8086f`): literal `2026-06-22` present ✅; remaining `{{ }}` placeholders = **0** ✅; no plumbing in compiled ✅
- 06-28 (`40659a31`): literal `2026-06-28` present ✅; remaining `{{ }}` placeholders = **0** ✅; no plumbing in compiled ✅

### Proof 2 — run-log shows live Notion + Hostfully calls (`/tmp/employee-{taskId:0:8}.log`)

From `/tmp/employee-51f8086f.log` (06-22, 2.9 MB):

- `tsx /tools/hostfully/get-checkouts.ts --date 2026-06-22` — live Hostfully fetch with the **resolved literal date** ✅
- `tsx /tools/composio/execute.ts --action NOTION_GET_PAGE_MARKDOWN --params '{"page_id": "370d540b438080ca8676e61856488960"}'` — live Notion fetch with real page ID ✅
- All **3** Notion page IDs fetched (4 calls each); Hostfully get-checkouts 4 calls; submit-output 2 calls.
- 06-28 log (3.1 MB) similarly shows Notion + get-checkouts activity.

**Live data was fetched at runtime — none of the cleaner names, ZIPs, times, or prices in the deliverables come from the stored steps (which are clean). They come from the live Notion pages.**

> Aside: the runtime logs show the model itself chose to run `node -e "new Date('2026-06-22')…toLocaleDateString…weekday"` to compute the day-of-week. This is the **model's own runtime tool use on the already-substituted literal date** — further proof that substitution happened before the model ran. It is NOT plumbing in the generated stored steps (which passed the gate). It does not affect the no-plumbing gate, which is scoped to the generated execution_steps.

---

## Bottom line

Structural hardening = success on all axes (simple description → clean steps, live fetch, correct substitution, no leaked plumbing, no hardcoded data). **Correctness = 3/5**, with two of three critical-date checks failing on the same reasoning gap: **no fallback to weekend/overflow backup cleaners (Berenice/Susana).** Per the "ALL 5 must be CORRECT" bar, the verdict is **REJECT**.
