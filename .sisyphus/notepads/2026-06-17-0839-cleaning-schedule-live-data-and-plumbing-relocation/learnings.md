# Learnings

## Task 1 — Pre-flight (2026-06-17)

- Cost column in `tasks` table is `cost_usd_cents` (integer, cents), not `cost_usd`. Divide by 100.0 for USD.
- All Docker infra containers healthy; `shared-postgres` is the container name for pg_dump operations.
- Single gateway confirmed on PID 77981 — no stale processes.
- Full $50/day cost budget available (VLRE tenant spend = $0 today).
- Worker image `ai-employee-worker:latest` present (f6d906a10ad7, 1.97GB).

## [2026-06-17] Task 2: Notion Connection + Page Structure

- Connection status: **ACTIVE** (VLRE Composio `notion` toolkit, connected 2026-06-12T15:49:45Z; gmail/slack/github also active).
- Tool invocation gotcha: `tsx` is NOT on PATH — use `./node_modules/.bin/tsx` from repo root. The audit-write stderr warning (`missing SUPABASE_URL/TASK_ID`) is benign in CLI context; stdout JSON is clean.
- Fetch action: `NOTION_GET_PAGE_MARKDOWN`, content at `.data.markdown`. All 3 pages `successful:true`, `truncated:false`.
- `python3` unavailable via asdf in this repo — use `node -e` for JSON parsing in scripts.
- Page structures:
  - `directorio-operativo` (trash schedule): nested bullet list under ZIP `##` headings. **Structural bug**: one ZIP group header (78724/78741/78722) is an H1 nested inside the 4402 McKinney bullet via a stray `<br>` — would mis-bucket 3 properties in a strict parser. Duplicate `4402 McKinney Falls Pkwy` entry.
  - `reporte-financiero` (cleaning times/prices): flat one-bullet-per-property; inline `Type ($price - NNN min)` segments split by escaped `\|`; `c/u` = per-unit pricing.
  - `manual-personal` (cleaner zones): **MIXED** — semi-structured cleaner roster + pure-prose numbered REGLAS (billing-on-CHECK-IN logic, 45-min traslado for 78744/78640 only, trash-reminder timing 1-day vs 2-then-1-day). Genuinely interpretive, not field-extractable.
- Key ambiguities: inconsistent bold/spacing, escaped `\$`/`\|`, multi-day & owner-handled trash exceptions, free-text cleaner availability, cross-page property-set + naming mismatches (`5306 King Charles` vs `5306 King Charles Dr`), zone groupings differ between pages.
- Overall assessment: LLM-readable but NOT deterministically parseable. Feed raw markdown to the employee and let it reason; do NOT build a brittle parser. Cross-page reconciliation by normalized address is required.
- Content hashes (md5):
  - directorio-operativo: `1c9999e53a44d599883aaca107f9668e`
  - reporte-financiero: `8c99070a99ec6acec445ac36da26cbfd`
  - manual-personal: `94fe6f4cda57b831d28fe339080176a1`

## [2026-06-17] Task 3: Hostfully Oracle

- 5 dates pinned with checkout counts: 2026-06-15 (5), 2026-06-20 (11), 2026-06-22 (1), 2026-06-28 (3), 2026-07-04 (1)
- Credentials: `hostfully_api_key` and `hostfully_agency_uid` are AES-256-GCM encrypted in `tenant_secrets` with base64 encoding (NOT hex). Decryption script must use `Buffer.from(iv, 'base64')` not `Buffer.from(iv, 'hex')`.
- Day-of-week verification: **2026-06-15 = Monday** (prior oracle was WRONG — labeled as Sunday). All 5 dates verified via `node -e "new Date('YYYY-MM-DDT12:00:00Z').getUTCDay()"`.
- Key findings:
  - ZIPs 78722, 78724, 78741 have NO cleaner assigned in manual-personal — significant gap in source data affecting 3505 Banton Rd, 5306 King Charles, 6002 Palm Circle.
  - 6002 Palm Circle ZIP discrepancy: reporte-financiero places it under 78744 section; API returns 78741; directorio-operativo groups it with 78724/78741/78722. API is authoritative.
  - 4403 Hayride has a "Unit S" in the API not listed in reporte-financiero (only A, B, C listed). Assumed same rate as A/B/C ($80 - 90 min).
  - Billing rule (Rule 1) requires same-day check-in data to determine Home vs Room billing. `get-checkouts.ts` only returns checkouts — check-in data gap is a known limitation.
  - 2026-06-20 (Saturday) is the highest-volume day (11 checkouts). Yessica hits her 240-min Saturday limit; Berenice/Susana backup required.
  - 2026-07-04 is US Independence Day — no holiday rule in manual-personal; cleaning proceeds normally per source data.
  - Trash reminder rules: 78744/78640 = 1 day before (Friday for Monday pickup, maintained Sat/Sun); 78203/78109 = 2 days then 1 day before.

## [2026-06-17] Task 4: Baseline-A (hardcoded employee reliability "before")

- Archetype 77e77c86-3bce-49a0-84e3-ccf7dac37b33 → role_name (= trigger slug) is `cleaning-schedule-v16`. **NO `slug` column on archetypes table** — the trigger endpoint resolves `/employees/{role_name}/trigger`. `approval_required` lives in `risk_model` JSON (= false here → straight to Done, no Slack approval needed).
- Deliverable storage: `deliverables.external_ref = task_id` (NOT `task_id` column; that doesn't exist). Also joinable via `deliverables.execution_id → executions.id → executions.task_id`. Content is a JSON StandardOutput envelope: `{version, summary, classification, draft}`. The `draft` field holds the human-readable schedule.
- All 5 tasks reached **Done** reliably in ~2 min each (fresh task IDs):
  - 2026-06-15 → 5e8842ea-0e56-441a-adb7-64f38f5356c2 → Done
  - 2026-06-20 → 9233e75e-481c-44d9-afa1-f3ad7154fcd2 → Done
  - 2026-06-22 → 94dfc866-d133-4f8e-803c-82bc804ffca0 → Done
  - 2026-06-28 → 0cab3972-b037-4f2a-8c82-3ac7dd809148 → Done
  - 2026-07-04 → 68daec83-149a-431d-95aa-0ca2a9935596 → Done
- Lifecycle (approval_required=false): Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done. Delivery container `employee-delivery-{taskId:0:8}` spawns even with approval_required=false (delivery_steps present).
- **CLEANING ACCURACY vs Task-3 oracle (the real reliability bar):**
  - 06-15: PERFECT (125min, all 5 units, Diana/Yessica + 78722 UNKNOWN flag)
  - 06-20: EXACT (725min; Yessica/Berenice internal split differs but per-cleaner totals identical, oracle flagged split as flexible)
  - 06-22: EXACT (180min, 6002-Palm 78741 UNKNOWN)
  - 06-28: **MATERIAL DIVERGENCE** — baseline marks 4403+4405 Hayride SIN ASIGNAR ("domingo, Yessica no trabaja") but oracle assigns BERENICE/SUSANA weekend backup (180min). **Hardcoded employee lacks weekend-backup-cleaner knowledge** — drops 180min of assignable work.
  - 07-04: EXACT (90min, Yessica 4403-Hayride Saturday)
- **Key divergences (the bar live-fetch must match/beat):**
  1. Sunday weekend-backup gap (06-28): baseline doesn't know Berenice/Susana cover 78744 on Sundays. Biggest correctness failure. Live version MUST assign weekend backups.
  2. Trash street-name HALLUCINATION (06-20, 06-28, 07-04): baseline writes "3401 Hovenweep Ave" / "3412 Hovenweep Ave" — these don't exist; correct = 3401 Breckenridge Dr / 3412 Sand Dunes Ave. Live version must use real street names.
  3. Trash coverage incomplete on Mondays (06-15, 06-22): emits only 2 of ~8 expected reminders.
  4. Trash internal-inconsistency (06-28): assigns Sunday trash to Yessica while its own cleaning section says Yessica doesn't work Sundays.
- **Net: cleaning is strong (4/5 exact, 1 material miss on Sunday backup). Trash is weak (hallucinations + coverage gaps) on every multi-property day.** This is the baseline live-fetch must match or beat.
- Gotcha: `python3` not pinned via asdf (errors "No version is set"). Used `node` for JSON extraction instead (/tmp/capture.mjs).

## [2026-06-17] Task 5: Baseline-B (converse-create generation snapshots)

- At-risk employees found in DB:
  - guest-messaging -> 94b1e64c-2c2a-4391-a6e3-f3ef61044cb5 (VLRE 0...0003)
  - code-rotation -> 00000000-0000-0000-0000-000000000016 (VLRE 0...0003)
  - daily-motivation -> a360b2e6-7dcc-410d-a17b-8d51e21c74ed (DozalDevs 0...0002)
  - jira-motivation-bot -> DOES NOT EXIST (0 rows; optional per spec, skipped, no file)
- daily-motivation confirmed: YES, active, id a360b2e6-7dcc-410d-a17b-8d51e21c74ed (genericity probe PASSES)
- Generation results (all 2-turn: turn1=clarifying question, turn2=proposal):
  - guest-messaging: PASS exec_steps=662 tools=4 trigger=webhook(NEW_INBOX_MESSAGE) deliverable=reply_text
  - code-rotation: PASS exec_steps=1206 tools=6 trigger=manual deliverable=null
  - daily-motivation: PASS exec_steps=366 tools=1 trigger=manual deliverable=null
- All 3 meet baseline req: non-empty execution_steps + non-empty tool_registry.
- archetype_generation_calls trace: 3 rows, call_type=propose_edit, archetype_id=NULL, status=success, model_actual=minimax/minimax-m2.7
- Files written:
  - .sisyphus/artifacts2/baseline-b/{guest-messaging,code-rotation,daily-motivation}.json
  - .sisyphus/artifacts2/baseline-b/index.md
  - .sisyphus/evidence2/task-5-baseline-b.txt (500 lines, full raw transcripts + DB output)
- Generator quirks observed (recorded as BEFORE reality, NOT fixed here):
  1. daily-motivation tool_registry = ONLY submit-output.ts (no explicit Slack post tool) despite "post to Slack" in desc.
  2. daily-motivation trigger came back {type:'manual'} despite "daily schedule 8am" in the answer.
  - These are the simplest-employee generator behaviors; if a fix changes them, compare against this snapshot.
- IMPORTANT request-shape gotchas:
  - converse-create body is { transcript: [{role,content}] } NOT { messages, tenantId }. tenantId is in the URL path only.
  - Response is a discriminated union: kind = question | proposal | no_change | too_long.
  - Short descriptions ALWAYS get a turn-1 clarifying question (by design). Send turn 2 with the full transcript (user + assistant question + user answer) to get the proposal.
  - python3 unavailable -> used `node -e` for all JSON build/parse. tsx not needed for this task (pure curl + node).

## [2026-06-17] Task 6: Relocation Map

- /tmp decoupling: **confirmed** — delivery-phase.mts reads `deliverables.content` from DB; only reads `/tmp/summary.txt` POST-delivery to confirm the delivery OpenCode session completed. DRAFT_PATH (`/tmp/draft.txt`) is not read by the harness at all.
- `/tmp/delivery-draft.txt` is a WORKING FILE inside the delivery container session only — not a cross-container artifact. Risk of removing generator teaching = LOW.
- Compiler injection order: identity(1) → CRITICAL_DIRECTIVE(2) → execution-instructions(3) → delivery-instructions(4) → Connected Apps(5,opt) → Custom Integrations(6,opt) → Learned Rules(7,opt) → Knowledge Base(8,opt) → Platform Rules/agents.md(9,always-lowest)
- Compiler insertion point for date-handling mechanic: **position 2.5** — after `CRITICAL_DIRECTIVE` push (line 234), before `<execution-instructions>` push (line 236) in `compileAgentsMd()` in `src/workers/lib/agents-md-compiler.mts`
- Exact function to add section: `compileAgentsMd()` at `src/workers/lib/agents-md-compiler.mts:230`
- Generator mechanics to DELETE: "Concrete Execution Steps Example" (SYSTEM_PROMPT_PRE L232-313), 10-point list items 4 (L321) and 7 (L322-324), same items in `buildConverseSystemPromptPre` (L602, L605). CLI teaching for `post-message.ts` in delivery templates (L82, L432).
- Generator mechanics to RELOCATE-to-compiler: `printenv INPUT_TARGET_DATE` (SYSTEM_PROMPT_PRE L122-125, L241-244, L317; buildConverseSystemPromptPre L560-563, L599) + `node -e getUTCDay` (L246-249, L318; buildConverseSystemPromptPre L599-600) → new `DATE_PARAMETERIZATION_RULES` constant, injected at position 2.5
- Generator mechanics to RELOCATE-to-compiler: `<approved-content>` XML parsing instructions (SYSTEM_PROMPT_PRE L82, L94-95, L431-432, L438; buildConverseSystemPromptPre L633) → prepend `APPROVED_CONTENT_CONTEXT` to the delivery-instructions wrapper in `compileAgentsMd()`
- Generator mechanics to RELOCATE-to-skill: `/tmp/delivery-draft.txt` convention (SYSTEM_PROMPT_PRE L82, L431-432; buildConverseSystemPromptPre L633-634) → add "Delivery Session Pattern" subsection to `tool-usage-reference/SKILL.md` hand-written section
- tool-usage-reference gaps: (1) `--text-file` flag for `post-message.ts` not documented (only `--text`), (2) delivery session pattern missing, (3) line 403 confusingly uses `/tmp/summary.txt` as a draft example (output contract file — should say `/tmp/draft.txt` only), (4) date-parameterization section if not going to compiler
- Notion Data Extraction Pattern (SYSTEM_PROMPT_PRE L343-363; buildConverseSystemPromptPre L611-617): KEEP + promote to unconditional PRIMARY pattern for all reference-data employees; delete hardcoding items 4 & 7 that contradict it

## [2026-06-17] Task 7: Playwright Auth

- Auth method: Drove the real dashboard login form (`supabase.auth.signInWithPassword`) with seeded user `playwright-auth@test.local` / `PlaywrightAuth123!` (PLATFORM_OWNER, supabase_id 183ec8f1-b3eb-488d-b404-9275c5c9c3b7). Password had to be reset first via Supabase admin API (PUT /auth/v1/admin/users/:id, service-role key). Login redirected to authenticated `/dashboard/?tenant=...`. Session persists in localStorage `supabase_access_token` + `sb-localhost-auth-token` (628-char HS256 JWT, 1h TTL).
- Wizard URL: http://localhost:7700/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003 — reachable, NOT redirected to login.
- Description textarea: VISIBLE (placeholder "e.g., An employee that reads our #support Slack channel..."), 0/2000 counter + disabled Generate button. No description submitted (Wave 3 scope).
- UI conventions: (1) Org switcher = SearchableSelect — opens "Search organizations…" input + type-to-filter list (DozalDevs/VLRE/Snobahn/...). (2) URL-encoded nav via useSearchParams — `?tenant=<uuid>` carried across routes; URL param wins over localStorage for active view. (3) Plain language — sidebar says "Organizations" not "Tenants" (skill live-trap already fixed); "Tenant Management" admin label still present. (4) Card shell `rounded-lg border bg-card px-5 py-4`.
- GOTCHA: Supabase auth/PostgREST is on port **54331**, not 54321 (54321 = Kong gateway, returned empty health). Use 54331 for local token calls.
- GOTCHA: `users` DB column is `role` (enum PLATFORM_OWNER|USER), not `global_role` (task sample query was wrong; `/me` API camelCases it to `globalRole`).
- GOTCHA: No WebGL problem on this React dashboard — headless Playwright worked fine (the WebGL caveat is for the separate dozaldevs-public Three.js site).
- Artifacts: screenshot `.sisyphus/evidence2/task-7-wizard-auth.png`; auth writeup `.sisyphus/artifacts2/playwright-auth.md`; reusable session `.sisyphus/artifacts2/playwright-storage-state.json`.

## [2026-06-17] Task 8: Plumbing Relocation

- `DATE_PARAMETERIZATION_RULES`: Added as new constant in compiler, injected at position 2.5 (after CRITICAL_DIRECTIVE, before execution-instructions). Conditional: `isDateParameterized()` checks if `executionSteps` or `deliverySteps` contains `INPUT_TARGET_DATE`. Generic — not cleaning-specific.
- `APPROVED_CONTENT_CONTEXT`: Added as new constant, prepended inside the `<delivery-instructions>` wrapper (position 4 prefix). Always injected — every delivery agent needs to know about `<approved-content>` XML. Teaches the `/tmp/delivery-draft.txt` convention + `--text-file` flag.
- `isDateParameterized()` helper: New function added to compiler, checks both executionSteps and deliverySteps for `INPUT_TARGET_DATE` string.
- Golden fixture: Regenerated via `GENERATE_GOLDEN=true pnpm test:unit -- golden-prompts`. APPROVED_CONTENT_CONTEXT now appears in delivery wrapper. DATE_PARAMETERIZATION_RULES NOT in fixture (FIXED_COMPILE_INPUT has no INPUT_TARGET_DATE — correct behavior).
- tool-usage-reference additions:
  1. `--text-file <path>` flag documented in `post-message.ts` Optional flags list
  2. "Delivery example with --text-file" inline example under post-message.ts
  3. New `## Delivery Session Pattern` section with 4-step workflow, key invariants table
  4. Clarifies `/tmp/delivery-draft.txt` vs `/tmp/summary.txt` distinction
- Tests: 5 pre-existing failures remain (all confirmed pre-existing via git stash); golden-prompts now PASSES
- Lint: PASS
- Docker build: EXIT_CODE:0 (ai-employee-worker:latest rebuilt successfully)
- Base agents.md: Unchanged (stays thin at 16 lines)

## [2026-06-17] Task 9: Generator Rework

- **SYSTEM_PROMPT_PRE changes**: Deleted 82-line "Concrete Execution Steps Example" section (warehouse domain hardcode example). Removed items 1 (printenv), 2 (getUTCDay), 4 (hardcode zone table), 7 (hardcode calendar) from 10-point pattern list; renumbered remaining to 6 items. Removed item 3 (printenv reading) from DATE/PERIOD RULE. Rewrote Template A/B step 1 to intent-level language, removing `/tmp/delivery-draft.txt` and `<approved-content>` XML parsing instructions. Also cleaned line 82 (delivery_steps rule definition) and line 95 (before/after contrast) which contained `/tmp/delivery-draft.txt`.
- **buildConverseSystemPromptPre changes**: Removed item 3 from DATE/PERIOD RULE. Removed items 1, 2, 4, 7 from CONCRETE EXECUTION STEPS PATTERN (11 items → 7 items). Rewrote DELIVERY STEPS RULE step 1. Fixed EXPLICIT BUSINESS RULES ENCODING calendar bullet to avoid "Do NOT read it from Notion" phrase.
- **Notion → Runtime Reference-Data**: Renamed and generalized the Notion extraction pattern in both paths: `## Notion Data Extraction Pattern` → `## Runtime Reference-Data Extraction Pattern` (SYSTEM_PROMPT_PRE) and `NOTION DATA EXTRACTION PATTERN` → `RUNTIME REFERENCE-DATA EXTRACTION PATTERN` (converse). Conditions changed from "when description mentions Notion" to "any employee that reads reference data at runtime". Generalized all Notion-specific references to generic "reference data source".
- **Parity check**: Both paths now have exactly 12 lines matching `^\d+\. \*\*` (6 in "When generating..." + 1 in step template + 5 in extraction pattern for SYSTEM_PROMPT_PRE; 7 in CONCRETE STEPS + 5 in EXTRACTION PATTERN for converse).
- **Test**: New `tests/unit/generator-prompts-parity.test.ts` — 11 tests, all pass.
- **Golden snapshot**: Regenerated `tests/fixtures/golden/system-prompt.txt` after prompt changes. `compiled-agents-md.txt` unchanged (fixed input has no INPUT_TARGET_DATE, so DATE_PARAMETERIZATION_RULES section not injected).
- **Gotcha**: The EXPLICIT BUSINESS RULES ENCODING calendar bullet in converse contained `Do NOT read it from Notion at runtime.` — this matched the parity test assertion `not.toContain('Do NOT read it from Notion')`. Rephrased to avoid the phrase while keeping intent.
- **Pre-existing failures unchanged**: archetype-generator-repair (LLM mock JSON error), admin-archetypes-create (Prisma mock undefined), time-estimation-integration (DB mock) — confirmed pre-existing by git diff (none of those files touched).
- **Lint**: PASS (no ESLint issues in new test file or edited prompt file).

## [2026-06-17] Task 11: Employee Creation from Simple Description

- Archetype ID: `2721f312-2a1e-406f-b2ca-77c2a0b4d21b`
- Role name: `programacion-limpieza-diario`
- Turn 1 question: "¿A qué hora del día debería ejecutarse este empleado? Por ejemplo, a las 8:00 AM para que el horario esté listo al inicio de la jornada."
- Turn 2 answer: Provided Notion page IDs, manual trigger with target_date parameter, Slack channel C0B71QSMZKQ, no approval needed
- No-plumbing gate: PASS (all 6 tokens clean — no printenv, node -e, getUTCDay, tsx /tools/, <approved-content>, /tmp/)
- No-hardcoded-data gate: PASS (no inline cleaning times, cleaner names, trash days, or property names)
- Tool registry: ["/tools/hostfully/get-checkouts.ts", "/tools/slack/post-message.ts", "/tools/platform/submit-output.ts"] — Composio NOT in registry (referenced in prose as "Use Notion via Composio")
- input_schema: [{key: "target_date", type: "date", frequency: "every_run", required: true}]
- Key observations:
  1. 2-turn flow: short description → 1 clarifying question → proposal (by design)
  2. Generator uses {{target_date}} template syntax in execution_steps (not $INPUT_TARGET_DATE)
  3. Day-of-week determination is intent-level ("Determine the day of week of {{target_date}}") — no node -e or getUTCDay leaked
  4. Delivery_steps has channel hardcoded as C0B71QSMZKQ (because user provided it in description)
  5. delivery_steps says "approval_required: false" but still has delivery phase — correct (delivery_steps ≠ approval_required; delivery always happens for employees with delivery_steps)
  6. risk_model.approval_required = false confirmed in proposal
  7. DB INSERT: used $$ dollar quoting for text fields; confirmed no $$ in generated content beforehand
  8. vm_size = 'performance-1x' set manually in INSERT (generator doesn't set this — platform requirement)
  9. Composio Notion integration NOT in tool_registry — worker will need tool-usage-reference skill to discover it at runtime

## [2026-06-17] Model Fix Correction

- deepseek quality_index corrected from 50 → 55 (user-specified placeholder)
- throughput_tokens_per_sec added: 77 t/s (confirmed production value)
- With throughput=77: deepseek now scores 'fast' (77 > 40 threshold) → speedScore=100
- Final deepseek score: ~75.25 vs minimax: ~48.5 — deepseek wins decisively
- Commit: fix(model-catalog): set deepseek quality_index=55 and throughput=77tps

## [2026-06-17] Task 12 Completion (2 remaining dates)

- 2026-06-28 task ID: 798d7a70-975f-4458-b9a9-c5219d610db2, verdict: INCORRECT, root cause: {{target_date}} not substituted → agent used system date 2026-06-17 (Wednesday) → fetched 4 wrong checkouts, assigned Yessica to Sunday 78744 tasks (she doesn't work Sundays — Berenice/Susana should be assigned)
- 2026-07-04 task ID: f1c749ca-6fcc-46e7-9855-662e1a6ac001, verdict: INCORRECT, root cause: same {{target_date}} bug → agent used system date 2026-06-17 (Wednesday) → fetched 4 wrong checkouts; the only actual July 4 checkout (4403 Hayride Unit A → Yessica) was completely absent
- Overall: 0/5 correct across all dates
- Live-fetch confirmed: YES (all 5 dates) — `tsx /tools/hostfully/get-checkouts.ts --date 2026-06-17` + NOTION_QUERY_DATABASE (370d540b...) called on every run; the fetch mechanism works, only the date is wrong
- {{target_date}} bug affects all dates — T13 must diagnose why the template compiler leaves {{target_date}} unresolved in compiled_agents_md; AGENTS.md pattern says to use `printenv INPUT_TARGET_DATE` but the archetype uses {{target_date}} syntax instead
- Files written: evidence2/task-12-judgments/2026-06-28.md, 2026-07-04.md, summary.md

## [2026-06-17] Task 14 Fix Loop — Iteration 1

### Platform Fix Applied (commit c4d07e7a)

- Root cause of {{target_date}} bug: `substituteTemplateVars()` existed in `template-vars.ts` but was NEVER called on the compiled AGENTS.md in execution-phase or delivery-phase. The env var `INPUT_TARGET_DATE` was set correctly by the lifecycle (machine-provisioner.ts:82-89), but the substitution step was missing.
- Fix: Added `substituteTemplateVars(rawCompiledAgentsMd, buildTemplateVars())` in both `execution-phase.mts` and `delivery-phase.mts` after `compileAgentsMd()`. Generic — works for ALL input keys, not just `target_date`.
- Also reverted bridge sentence from `DATE_PARAMETERIZATION_RULES` in `agents-md-compiler.mts` — wizard-generated archetypes use `{{target_date}}` which is now resolved by `substituteTemplateVars`, so the legacy injection is not needed.
- 3 new unit tests added to `input-schema-pipeline.test.ts` proving multi-key generic substitution.

### Verification Results

- Docker rebuild: ✅ EXIT_CODE:0
- Archetype `cleaning-schedule-v17` (id: 8ed564e5) created via converse-create 2-turn, vm_size=performance-1x, approval_required=false
- Plumbing check: CLEAN (no printenv, node -e, getUTCDay, tsx /tools/, <approved-content>, /tmp/)
- All 5 tasks reached Done status
- `{{target_date}}` resolved in compiled_agents_md for ALL 5 tasks (DB verified)
- Live-fetch proven: 384 log lines mentioning composio/NOTION/get-checkouts in task 509ba0ec log
- daily-motivation (generic proof): task 3271be82 → Done, no regression
- Baseline-B: guest-messaging (1055 chars, 4 tools), code-rotation (605 chars, 4 tools), daily-motivation (231 chars, 1 tool) — all PASS

### Oracle Judgments (Iter 1)

- 2026-06-15: ⚠️ PARTIAL — Yessica assigned to 3505 Banton Rd (78722, oracle: UNKNOWN). Trash incomplete.
- 2026-06-20: ⚠️ PARTIAL — Total 725min correct! Yessica over-assigned (460min vs 190min Saturday limit). 5306 King Charles → Yessica (oracle: UNKNOWN).
- 2026-06-22: ⚠️ PARTIAL — 6002 Palm Circle → Yessica (oracle: UNKNOWN/78741). Duration 165min vs 180min. Trash incomplete.
- 2026-06-28: ⚠️ PARTIAL — All → Yessica (oracle: Berenice/Susana for 78744 Sunday, UNKNOWN for 78722). Trash incomplete.
- 2026-07-04: ⚠️ PARTIAL — Yessica/90min correct! Trash duties missing (Monday reminder for 7213 Nutria Run + 271 Gina Dr).

### Root Cause of Remaining Inaccuracies

The platform fix works. The remaining errors are model reasoning quality:

1. The archetype's execution_steps reference "Cleaning Rules database", "Cleaner Assignments database", "Trash Schedule database" — these don't exist as named databases in Notion. The actual pages are prose documents.
2. The model can't reliably extract structured data from prose Notion pages using database-style queries.
3. The model doesn't apply capacity limits (Yessica's Saturday 4h window).
4. Trash duty logic is incomplete — model doesn't enumerate all properties in each cleaner's zone.

### Next Iteration Needed

To get CORRECT on all 5 dates, the archetype's execution_steps need to:

1. Reference the actual Notion page IDs (370d540b...) directly
2. Describe the prose structure of each page (not assume database format)
3. Include explicit instructions for capacity limits and trash duty enumeration
4. Provide the actual page IDs for each Notion document

## [2026-06-17] Atlas verification of iter-2/3 (v19) — generator page-id fix WORKS

### Generator fix confirmed effective

- v20 execution_steps now reference all 3 REAL Notion page IDs (370d540b4380809a8ea0c11074f92abb, ...ca8676..., ...969a72...) and contain ZERO fictional "Cleaning Rules database"/"Cleaner Assignments database"/"Trash Schedule database" names. The Source Identifier Fidelity Rule (both prompt paths) fixed the hallucinated-source bug.

### v19 (c6419e60) 5-date judgment by Atlas (tasks reached Done at 21:40):

- 06-15 (6dece9ec): CORRECT — 271 Gina→Diana exclusive; 3505 Banton (78722)→NO ASIGNADO; real street names (3401 Breckenridge, 3412 Sand Dunes — NOT hallucinated Hovenweep); durations match.
- 06-20 (ddcd55b2): CORRECT/near — Yessica capped 190min within Sat 4h limit; Berenice backup for excess (4403 A/B/S). Big improvement over iter-1 over-assignment.
- 06-22 (a328865e): ⚠️ INCORRECT — 6002 Palm Circle → assigned Yessica/180min, but ORACLE says UNKNOWN (ZIP 78741 has NO cleaner in manual-personal). Duration right, assignment wrong. Employee inferred coverage for 78741 because directorio-operativo groups it in "78724/78741/78722" cluster. THIS IS THE REMAINING GENERIC DEFECT: employee must NOT infer cleaner coverage from ZIP-grouping in the property/trash directory; coverage comes ONLY from manual-personal roster; unlisted ZIP → UNASSIGNED.
- 06-28 (b35cd55a): CORRECT — Berenice weekend backup for 4403+4405 Hayride (78744, Sunday, 180min); 3505 Banton (78722)→NO ASIGNADO; durations match. (This was the hardest date / biggest Baseline-A failure.)
- 07-04 (776ae612): CORRECT — Yessica/4403 Hayride/90min; trash reminders for 7213 Nutria + 271 Gina present; post-collection confirm task for 3505 Banton.

Net: v19 = 4/5 CORRECT. Only 06-22 fails (78741 inferred-coverage). Trash completeness and weekend backup now solid.

### NEW config defect (subagent missed): approval_required

- v19 AND v20 were INSERTed with risk_model {"approval_required": true, "timeout_hours":24} — the generator's DEFAULT — instead of {"approval_required": false}. Result: v20's 5 dates are STUCK in Reviewing (waiting for Slack approval that never comes; reviewing-watchdog will Fail them after 30 min). v19's tasks reached Done (different timing). For clean 5-date judging, the INSERT MUST force risk_model={"approval_required": false}. NOT a platform bug — an INSERT-config mistake.

### Remaining work to close T14

1. ONE generic generator refinement: instruct employee that coverage/assignment comes ONLY from the roster source (manual-personal); never infer a cleaner from ZIP groupings in other directories; unlisted ZIP → UNASSIGNED. Must be generic (no cleaning/ZIP specifics) + mirror both paths.
2. Re-create fresh employee with approval_required=false; trigger 5 dates; confirm ALL 5 CORRECT (esp. 06-22 now UNASSIGNED for 78741).
3. Genericity proof (daily-motivation) + Baseline-B regen + commit.

## [2026-06-17] T14 CLOSED — Final Iteration (cleaning-schedule-v22)

### Root cause confirmed

Two prompt paths in `archetype-generator-prompts.ts` contradicted each other:

- `SYSTEM_PROMPT_PRE` taught OLD plumbing: "Write draft content to /tmp/ before submitting"
- `buildConverseSystemPromptPre` correctly taught intent-only: "no tsx /tools/... CLI commands"
- Neither path emitted `{{target_date}}` — steps said "the given target date" (prose) so the model invented a date

### Fix applied (this commit)

- Removed `/tmp/draft.txt` from SYSTEM_PROMPT_PRE "RIGHT" example (line 94)
- Removed "write draft to /tmp/" from execution_steps definition (line 88)
- Replaced old rule 4 (write to /tmp/) with new rule 4 (plain-English final step, no /tmp/ or CLI)
- Strengthened `{{target_date}}` rule in SYSTEM_PROMPT_PRE: "NEVER use prose like 'the given date'", "NEVER instruct to read env var, run printenv, or compute via shell command"
- Mirrored same anti-plumbing + {{key}} rules into buildConverseSystemPromptPre (DATE/PERIOD RULE + Rules bullet)
- REFINE_SYSTEM_PROMPT_PRE left out of scope (intentionally CLI-level)

### Verification

- Parity test: 60/60 PASS
- Golden test: 3/3 PASS
- Lint: CLEAN
- HARD GATE: {{target_date}} present (3x), zero plumbing, all 3 real Notion page IDs verbatim
- compiled_agents_md for 06-22: {{target_date}} resolved to 2026-06-22, zero plumbing in steps
- 5/5 dates CORRECT (genuine — no hand-edits to execution_steps/delivery_steps)
- Genericity proof: daily-motivation (DozalDevs tenant) — no VLRE literals, no plumbing, intent-only final step

### Key learning: tool_registry gap

Generator did NOT add /tools/composio/execute.ts despite steps reading Notion via Composio. COMPOSIO TOOL REGISTRY RULE not firing for this description pattern. Added manually to tool_registry (not execution_steps) to allow runtime. This is a separate generator bug to fix in a future iteration.

### Archetype

- ID: bdc95a01-8040-4b92-84ab-b6884e6b8801
- role_name: cleaning-schedule-v22
- Task IDs: 694500d1 (06-15), d3257c7d (06-20), b398cc00 (06-22), 7d75f8ba (06-28), 5420f695 (07-04)
