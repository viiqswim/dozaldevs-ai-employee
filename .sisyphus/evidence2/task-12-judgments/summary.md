# Task 12 Summary — All 5 Dates

## Results Table

| Date       | Day      | Task ID                                | Verdict   | Root Cause                                                      |
| ---------- | -------- | -------------------------------------- | --------- | --------------------------------------------------------------- |
| 2026-06-15 | Monday   | `b97b5ccc-95aa-4d18-a28b-e92d77304ad0` | INCORRECT | `{{target_date}}` not substituted → used system date 2026-06-17 |
| 2026-06-20 | Saturday | `10f28551-5c1a-4398-b9b6-0831144839d7` | INCORRECT | same                                                            |
| 2026-06-22 | Monday   | `dc231db9-5630-46b5-8eee-46e96e7f8431` | INCORRECT | same                                                            |
| 2026-06-28 | Sunday   | `798d7a70-975f-4458-b9a9-c5219d610db2` | INCORRECT | same                                                            |
| 2026-07-04 | Saturday | `f1c749ca-6fcc-46e7-9855-662e1a6ac001` | INCORRECT | same                                                            |

## Overall: 0/5 correct

All 5 dates produced INCORRECT output. The agent used the system date (2026-06-17) for every run regardless of the `target_date` input.

## Live-Fetch: YES (confirmed on all dates)

All 5 runs confirmed live API calls:

- **Hostfully API:** `tsx /tools/hostfully/get-checkouts.ts --date 2026-06-17` (live call to Hostfully, but with wrong date)
- **Notion API:** `NOTION_QUERY_DATABASE` with database ID `370d540b438080ca8676e61856488960` (live call)
- Date 1 (06-15): 461 Notion-related log entries
- Dates 2–5: Notion + Hostfully calls confirmed

The live-fetch mechanism works. The problem is date injection, not connectivity.

## No-Leak Gate: PASS (confirmed in T11)

Tenant isolation verified in prior task. No cross-tenant data exposure.

## Key Defects for T13

### Defect 1 (CRITICAL): `{{target_date}}` template substitution not working

- **Symptom:** All 5 runs produced schedule for June 17 (system date), regardless of `target_date` input
- **Evidence:** Compiled AGENTS.md (confirmed via `tasks.compiled_agents_md`) contains literal `{{target_date}}` strings
- **Impact:** Employee is completely non-functional for date-specific scheduling
- **Affected code:** Template compiler in `src/workers/lib/agents-md-compiler.mts` or the input injection pipeline (`loadTenantEnv()` / `PLATFORM_ENV_WHITELIST`)
- **Expected behavior:** Agent should receive `target_date` as `INPUT_TARGET_DATE` env var AND execution_steps should use `printenv INPUT_TARGET_DATE` per the AGENTS.md date-parameterized pattern

### Defect 2: Wrong cleaner assignment for ZIP 78722

- **Symptom:** Agent sometimes assigns Yessica to 3505 Banton Rd (78722) tasks, but no cleaner is assigned to 78722 in manual-personal
- **Impact:** Incorrect schedule even if date bug were fixed
- **Note:** This is a secondary defect dependent on the agent correctly reading the knowledge base for 78722

### Defect 3: Sunday staffing constraint not enforced

- **Symptom:** On 2026-06-28 run, agent assigned Yessica to 78744 tasks — she does not work Sundays
- **Impact:** Berenice/Susana should be assigned for Sunday 78744 cleanings
- **Note:** Secondary defect; correct date would expose this constraint in agent reasoning

### Defect 4: Trash duty day-logic not applied correctly for weekend dates

- **Symptom:** On Saturday/Sunday runs, agent did not apply the "maintain Monday reminder" or "2-days-before-Tuesday" logic
- **Impact:** Missing trash reminders for 7213 Nutria Run, 271 Gina Dr, 407 S Gevers, 6930 Heron Flats, 8039 Chestnut Cedar
- **Note:** This defect is masked by defect 1 (all runs used the wrong Wednesday date)

## What Happens When Date Bug Is Fixed (T14 expected improvement)

If T13/T14 fixes the `{{target_date}}` substitution, the agent will:

1. Correctly fetch checkouts for the requested date from Hostfully
2. Apply correct day-of-week logic (Sunday = Berenice/Susana; Saturday = Yessica)
3. Apply correct trash duty rules per day

Remaining risks after date fix: the 78722 cleaner gap and holiday handling.

## Execution Timeline

All 5 runs executed 2026-06-17 (today):

- 06-15: triggered ~18:44 UTC, Done in ~5 min
- 06-20: triggered ~18:51 UTC, Done in ~3 min
- 06-22: triggered ~19:10 UTC, Done in ~4 min
- 06-28: triggered ~19:35 UTC, Done in ~5 min
- 07-04: triggered ~19:42 UTC, Done in ~3 min
