# Root-Cause Fix: Delivery Phase Throws on `getTunnelUrl()` in Full-Cloud Mode

## TL;DR

> **Quick Summary**: The delivery phase calls `getTunnelUrl()` without the `TUNNEL_URL`-set guard that the execution phase already has, so in production (`WORKER_RUNTIME=fly`, no `TUNNEL_URL`) every delivery throws, Inngest exhausts retries, and the task hangs forever in `Delivering`. Fix the guard at the source by extracting a single shared URL-resolver used by BOTH phases, then audit and close the other execution-vs-delivery env divergences the duplication created.
>
> **Deliverables**:
>
> - `resolveWorkerSupabaseUrl()` shared helper — single source of truth for the fly/tunnel URL decision, called by both `machine-provisioner.ts` and `delivery-retry.ts`
> - Unit test covering all 4 `(WORKER_RUNTIME × TUNNEL_URL)` combinations + an equivalence assertion proving both call sites resolve identically
> - `TENANT_ID`/`TASK_TENANT_ID` added to the delivery env (closes the `requireEnv('TENANT_ID')` hard-exit time-bomb for any delivery employee with a tenant-scoped platform tool)
> - Production debugging guide + drift-audit doc updated to record the recurrence and the new single source
> - Live stuck task `635a62f9` remediated (marked Failed + fresh task fired) AFTER the fix is deployed `live`
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (shared helper) → Task 2 (wire delivery) → Task 5 (unit test) → Task 8 (deploy + prod E2E) → Task 9 (remediate stuck task)

---

## Context

### Original Request

A teammate created their own AI employee (`slack-channel-summarizer`) and triggered it. It got stuck in "Processing" for 20+ minutes. The user wants the root cause fixed AND this class of bug prevented from ever happening again. The user **explicitly rejected any watchdog/band-aid** ("mark things as failed") approach — the fix must be at the root.

### Incident Facts (verified against production)

- Task `635a62f9-c419-4b37-b68b-dbd06ebba056`, run `01KV8K6P2FGERHF865YA0AMNJ4`.
- Employee `slack-channel-summarizer`, archetype `ea6c44d8-14f8-49c2-a60b-ad1171f10837`, tenant `c7e5b720-301c-4aa5-b4b7-464fb1909ac0`, notification channel `C05UL7X6B54`.
- Lifecycle trace ends at `Submitting → Delivering` (actor `lifecycle_fn`), then NOTHING for 27+ minutes. `failure_reason = NULL`.
- Execution SUCCEEDED: 1 execution row (20379 prompt + 943 completion tokens, $0.004), deliverable written with classification `NEEDS_APPROVAL`, but `approval_required=false` so it took the no-approval delivery path.
- Fly app `ai-employee-workers` = `suspended` with 0 machines (suspended is NORMAL/cosmetic per the prod debugging guide — NOT diagnostic; no delivery machine was ever created).

### Root Cause (PROVEN)

This is **Bug 1 from `docs/guides/2026-06-01-2246-production-debugging-guide.md`, re-introduced in the delivery path.**

- `getTunnelUrl()` (`src/lib/tunnel-client.ts:18-27`) THROWS `"TUNNEL_URL is not set"` when the env var is unset.
- Bug 1 was fixed Jun 1 (commit `0b342742`) by adding the guard `&& process.env.TUNNEL_URL` — but ONLY to the execution path. Today that guarded line lives at `src/inngest/lifecycle/lib/machine-provisioner.ts:64-65`. **That's why execution works.**
- The Jun 7 refactor (commit `751c9b19`, "extract step modules; split approval handler") carried the OLD, unguarded line into the new delivery module: `src/inngest/lifecycle/steps/delivery-retry.ts:115-116`:
  ```ts
  const effectiveSupabaseUrlForDelivery =
    WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl; // missing && process.env.TUNNEL_URL
  ```
- Production env (verified via Render API): `WORKER_RUNTIME=fly`, `TUNNEL_URL` NOT set (correct for full-cloud mode — Supabase Cloud needs no tunnel).
- Therefore in prod delivery: `WORKER_RUNTIME==='fly'` is true → `getTunnelUrl()` is called → throws → the `step.run('run-delivery-no-approval')` (and the approval-path equivalent) throws → Inngest retries all throw the same way → retries exhausted → task abandoned at `Delivering`, no machine spawned. Matches every observed symptom.

### Why "never again" = de-duplication (not a watchdog)

The bug recurred precisely BECAUSE the fly/tunnel URL decision was **duplicated** in two files and only one copy got the Jun-1 fix. The root prevention is to make it impossible to diverge again: one shared helper, both call sites route through it, a unit test locks the behavior. A watchdog would only mask the symptom and risk killing legitimately-slow tasks — explicitly out of scope.

### Blast Radius (verified)

`getTunnelUrl` has exactly **2 callers** (no hidden third) — `machine-provisioner.ts` (guarded) and `delivery-retry.ts` (unguarded). But the delivery path runs for **9 of 12 active opencode employees** that have delivery configured (`delivery_steps` and/or legacy `delivery_instructions`), across **5 tenants**, including the seeded production employees `guest-messaging`, `daily-summarizer`, and `code-rotation`. Every one of them has been hitting this throw in prod-fly delivery. This is platform-wide, not one employee.

### Metis Review — Divergence Audit

Metis + direct source read found the duplication created **6+ execution-vs-delivery env divergences**, ruled as:

| #   | Divergence (present in execution, MISSING in delivery)      | Ruling                                                                                                           | Tier                     |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | `getTunnelUrl()` missing `TUNNEL_URL` guard                 | **BUG — the incident**                                                                                           | **P0**                   |
| 2   | `TENANT_ID` / `TASK_TENANT_ID` not in delivery env          | **BUG** — `report-issue.ts:126` / `rotate-property-code.ts:181` do `requireEnv('TENANT_ID')` → `process.exit(1)` | **P1 (this PR)**         |
| 3   | `ISSUES_SLACK_CHANNEL` not passed                           | BUG (minor — Slack alert skipped, DB write still works)                                                          | P1 (this PR)             |
| 4   | `PLATFORM_ENV_MANIFEST` not augmented with delivery vars    | BUG                                                                                                              | P1 (this PR)             |
| 5   | `archetype.worker_env` not spread into delivery env         | BUG — custom archetype env silently dropped                                                                      | P1 (this PR)             |
| 6   | `NOTIFY_MSG_CHANNEL` not passed                             | BUG — failure Slack update may hit `channel_not_found`                                                           | P1 (this PR)             |
| 7   | `MESSAGE_UID` / `OVERRIDE_DIRECTION` / `INPUT_*` not passed | Likely bug for guest-messaging delivery; unproven for others                                                     | **P2 (deferred ticket)** |
| 8   | `EMPLOYEE_RULES` / `EMPLOYEE_KNOWLEDGE` / `REPLY_BROADCAST` | **INTENTIONAL** — delivery does NOT re-execute or re-broadcast                                                   | **MUST NOT copy**        |

Validation results: `report-issue` is NOT in the summarizer's `tool_registry` (so #2 is latent for THIS employee), but `report-issue` and `rotate-property-code` are tenant-scoped platform/Sifely tools reachable from OTHER delivery employees (`code-rotation` uses Sifely) — so #2 is a live same-class time-bomb worth closing now.

---

## Work Objectives

### Core Objective

Eliminate the `Delivering`-hang at its source by making the fly/tunnel Supabase-URL decision a single shared function used by both worker-provisioning paths, and close the highest-value env divergences the duplication introduced — without regressing the working execution path and without copying execution-only fields into delivery.

### Concrete Deliverables

- `resolveWorkerSupabaseUrl(supabaseUrl: string): Promise<string>` in `src/inngest/lifecycle/lib/` (new file or added to an existing lib module beside `machine-provisioner.ts`).
- Both `machine-provisioner.ts:64-65` and `delivery-retry.ts:115-116` call the helper; no inline `getTunnelUrl` ternary remains in either.
- `TENANT_ID` + `TASK_TENANT_ID` added to the delivery env builder in `delivery-retry.ts` (both local-docker and fly branches).
- P1 env parity fixes (#3–#6) applied to the delivery env builder, each justified, none of the intentional-asymmetry fields (#8) added.
- Unit test file for the resolver (4 combos + equivalence assertion).
- Updated `docs/guides/2026-06-01-2246-production-debugging-guide.md` (Bug 1 section) and `docs/guides/2026-06-12-2030-drift-audit.md`.
- Live task `635a62f9` no longer dangling; a fresh summarizer task proves the fix in prod.
- Telegram completion notification.

### Definition of Done

- [ ] No inline `WORKER_RUNTIME === 'fly' ... getTunnelUrl()` ternary exists anywhere except inside the shared helper (`grep` returns only the helper).
- [ ] `pnpm test:unit` passes with the new resolver test present, 0 failures.
- [ ] `pnpm build` and `pnpm lint` clean.
- [ ] Render gateway deploy reaches `live`.
- [ ] A freshly-triggered `slack-channel-summarizer` task reaches `Done` in prod and posts to `C05UL7X6B54`, with a `Submitting → Delivering → Done` trace and a spawned `employee-delivery-*` Fly machine.
- [ ] Task `635a62f9` is `Failed` (clear reason) or provably superseded — no longer at `Delivering`.

### Must Have

- The shared helper returns **exactly** `supabaseUrl` when `!(WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL)`, and `await getTunnelUrl()` otherwise — byte-for-byte identical to the current guarded execution behavior.
- `TENANT_ID`/`TASK_TENANT_ID` present in delivery env (closes the `requireEnv` hard-exit).
- Live prod re-trigger E2E (per AGENTS.md — unit tests alone are insufficient for the delivery path).
- Remediation strictly ordered AFTER confirmed-`live` deploy.

### Must NOT Have (Guardrails)

- **NO watchdog / no "mark stuck tasks Failed" cron** — explicitly rejected by the user. Fix is root-cause only.
- **NO injecting `EMPLOYEE_RULES`, `EMPLOYEE_KNOWLEDGE`, or `REPLY_BROADCAST` into the delivery env** — these are intentional execution-only fields; delivery does not re-execute or re-broadcast. Document the asymmetry; do not "fix" it.
- **NO full `buildWorkerEnv()` mega-refactor** in this PR — extracting the entire ~80-line execution env block carries real regression risk to the working path. Note it as a recommended follow-up only.
- **NO behavioral change to the execution path** — `machine-provisioner.ts` must produce the identical resolved URL before and after.
- **NO P2 work (#7: `MESSAGE_UID`/`OVERRIDE_DIRECTION`/`INPUT_*`)** in this PR — defer to a separate ticket; only proven needed for guest-messaging delivery.
- **NO re-triggering the stuck task before the Render deploy is `live`** — it would re-fail identically.
- **NO use of `prisma migrate dev` / `db push` / `migrate reset`** against production (no schema change is expected in this plan anyway).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed via unit tests, prod DB queries, admin API, and Render/Fly APIs.

### Test Decision

- **Infrastructure exists**: YES (Vitest — `pnpm test:unit`).
- **Automated tests**: YES (tests-after for the resolver — a focused unit test added alongside the extraction).
- **Framework**: Vitest.
- **TDD**: The resolver test is the regression lock for the incident; write it to fail against the old unguarded delivery line and pass against the shared helper.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Shared helper / env builder**: Bash (`pnpm test:unit`, `pnpm build`, `pnpm lint`) + `grep` assertions on source.
- **Prod delivery path**: admin API trigger + prod DB (`psql` session pooler, port 5432, PG17 client) + Render API (deploy `live`) + Fly Machines API (delivery machine spawned) + Slack (message posted).

### Production access reference (from skills/guides — do not hardcode secrets in code)

- Prod DB (session pooler, PG17): `/opt/homebrew/opt/postgresql@17/bin/psql "postgresql://postgres.gjqrysxpvktmibpkwrvy:<pw>@aws-1-us-west-2.pooler.supabase.com:5432/postgres"` (password in the prod-debugging guide / `.env`).
- Render: `RENDER_API_KEY` + service `srv-d8f1b2gg4nts738dj7jg`; deploy status `GET /v1/services/$SID/deploys?limit=1`.
- Fly: `FLY_API_TOKEN` (in `.env`); `GET https://api.machines.dev/v1/apps/ai-employee-workers/machines`.
- Admin trigger: `POST https://ai-employees-laaa.onrender.com/admin/tenants/c7e5b720-301c-4aa5-b4b7-464fb1909ac0/employees/slack-channel-summarizer/trigger` with `Authorization: Bearer $SERVICE_TOKEN`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — code changes, all in src/inngest/lifecycle/):
├── Task 1: Create resolveWorkerSupabaseUrl() shared helper [quick]
├── Task 3: Audit delivery env builder vs execution; document rulings [deep]   (read-only analysis, parallel)
└── Task 6: Draft doc updates (prod-debugging guide + drift-audit) [writing]   (parallel, no code dep)

Wave 2 (After Task 1 + Task 3):
├── Task 2: Wire BOTH provisioners to the shared helper (depends: 1) [quick]
├── Task 4: Add TENANT_ID/TASK_TENANT_ID + P1 env parity to delivery (depends: 3) [unspecified-high]
└── Task 5: Unit test for resolver — 4 combos + equivalence (depends: 1) [quick]

Wave 3 (After all code/tests green locally):
└── Task 7: Local gate — build + lint + test:unit + grep assertions (depends: 2,4,5) [quick]

Wave 4 (After merge — REQUIRES deploy live; sequential):
├── Task 8: Confirm Render deploy live → prod E2E re-trigger (depends: 7 merged) [unspecified-high]
└── Task 9: Remediate stuck task 635a62f9 (depends: 8 — fix proven live) [quick]

Wave FINAL (after all):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real prod QA replay (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → user okay → Task 10: Telegram completion

Critical Path: 1 → 2 → 5 → 7 → 8 → 9 → F1-F4 → user okay → 10
```

### Dependency Matrix

- **1**: deps none → blocks 2, 5
- **2**: deps 1 → blocks 7
- **3**: deps none → blocks 4
- **4**: deps 3 → blocks 7
- **5**: deps 1 → blocks 7
- **6**: deps none → blocks (doc, ties to F1)
- **7**: deps 2,4,5 → blocks 8
- **8**: deps 7 (merged + live) → blocks 9
- **9**: deps 8 → blocks F-wave
- **10**: deps F-wave + user okay

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T3 → `deep`, T6 → `writing`
- **Wave 2**: T2 → `quick`, T4 → `unspecified-high`, T5 → `quick`
- **Wave 3**: T7 → `quick`
- **Wave 4**: T8 → `unspecified-high`, T9 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`, T10 → `quick`

---

## TODOs

- [x] 1. Create `resolveWorkerSupabaseUrl()` shared helper

  **What to do**:
  - Add an exported async function `resolveWorkerSupabaseUrl(supabaseUrl: string): Promise<string>` in `src/inngest/lifecycle/lib/` (recommended: new file `worker-url-resolver.ts` beside `machine-provisioner.ts`, OR add to an existing lib module there — match the directory's import/style conventions).
  - Body must be EXACTLY the guarded execution logic:
    ```ts
    import { getTunnelUrl } from '../../../lib/tunnel-client.js';
    import { WORKER_RUNTIME } from '../../../lib/config.js';
    export async function resolveWorkerSupabaseUrl(supabaseUrl: string): Promise<string> {
      return WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL
        ? await getTunnelUrl()
        : supabaseUrl;
    }
    ```
  - Add a short doc comment explaining: hybrid mode (local Supabase + fly workers) needs the tunnel; full-cloud mode (Supabase Cloud + fly workers) must NOT call `getTunnelUrl()` because it throws when `TUNNEL_URL` is unset. Reference Bug 1 / commit `0b342742`.

  **Must NOT do**:
  - Do not change the boolean expression (keep `WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL`).
  - Do not make it synchronous — `getTunnelUrl` is async; keep `Promise<string>`.
  - Do not check `TUNNEL_URL` before `WORKER_RUNTIME` (docker runtime must win even if `TUNNEL_URL` is set).

  **Recommended Agent Profile**:
  - **Category**: `quick` — single small pure function, no logic ambiguity.
  - **Skills**: [`inngest`] — touches lifecycle lib; conventions for the step/lib modules.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Blocked By**: None — **Blocks**: 2, 5

  **References**:
  - `src/inngest/lifecycle/lib/machine-provisioner.ts:64-65` — the exact guarded expression to lift (source of truth for behavior).
  - `src/lib/tunnel-client.ts:18-27` — `getTunnelUrl()` throws when `TUNNEL_URL` unset (why the guard matters).
  - `src/lib/config.ts` — `WORKER_RUNTIME` export.
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md` "Bug 1" — the original fix rationale.

  **Acceptance Criteria**:
  - [ ] New exported async function exists with the exact guarded expression.
  - [ ] `pnpm build` compiles (type-checks the new module).

  **QA Scenarios**:

  ```
  Scenario: Helper compiles and exports correctly
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Run: grep -rn "export async function resolveWorkerSupabaseUrl" src/inngest/lifecycle/lib/
    Expected Result: build exits 0; grep returns exactly one match
    Evidence: .sisyphus/evidence/task-1-helper-export.txt
  ```

  **Commit**: groups with code commit (see Commit Strategy).

- [x] 2. Wire BOTH provisioners to the shared helper

  **What to do**:
  - In `src/inngest/lifecycle/lib/machine-provisioner.ts`: replace the inline ternary at lines 64-65 with `const effectiveSupabaseUrl = await resolveWorkerSupabaseUrl(supabaseUrl);`. Remove the now-unused `getTunnelUrl` import if no other use remains.
  - In `src/inngest/lifecycle/steps/delivery-retry.ts`: replace the inline ternary at lines 115-116 with `const effectiveSupabaseUrlForDelivery = await resolveWorkerSupabaseUrl(supabaseUrl);`. Remove the now-unused `getTunnelUrl` import.
  - This is THE incident fix: delivery now gets the `TUNNEL_URL` guard via the shared helper.

  **Must NOT do**:
  - Do not leave any inline `getTunnelUrl()` ternary in either file — the helper is the only place it may appear.
  - Do not alter the surrounding env-object assembly in this task (that's Task 4).
  - Do not change `machine-provisioner`'s resulting value — it must remain identical.

  **Recommended Agent Profile**:
  - **Category**: `quick` — two mechanical call-site swaps.
  - **Skills**: [`inngest`].

  **Parallelization**:
  - **Can Run In Parallel**: NO (after Task 1) — **Blocked By**: 1 — **Blocks**: 7

  **References**:
  - `src/inngest/lifecycle/lib/machine-provisioner.ts:4,64-65` — import + ternary to replace.
  - `src/inngest/lifecycle/steps/delivery-retry.ts:15,115-116` — import + UNGUARDED ternary to replace (the bug).
  - Task 1 helper signature.

  **Acceptance Criteria**:
  - [ ] Both files call `resolveWorkerSupabaseUrl`; neither has an inline `getTunnelUrl` ternary.
  - [ ] `pnpm build` + `pnpm lint` clean (no unused-import errors).

  **QA Scenarios**:

  ```
  Scenario: No inline tunnel ternary remains outside the helper
    Tool: Bash
    Steps:
      1. Run: grep -rn "WORKER_RUNTIME === 'fly'" src/inngest | grep "getTunnelUrl"
    Expected Result: returns ONLY the helper file line; zero matches in machine-provisioner.ts and delivery-retry.ts
    Evidence: .sisyphus/evidence/task-2-no-inline-ternary.txt

  Scenario: Both call sites use the helper
    Tool: Bash
    Steps:
      1. Run: grep -rn "resolveWorkerSupabaseUrl(" src/inngest/lifecycle
    Expected Result: 3 matches — 1 definition (helper) + 2 call sites
    Evidence: .sisyphus/evidence/task-2-call-sites.txt
  ```

  **Commit**: groups with code commit.

- [x] 3. Audit delivery env builder vs execution; rule each divergence

  **What to do** (READ-ONLY analysis task — produces a written ruling, no code yet):
  - Compare the delivery env object built in `src/inngest/lifecycle/steps/delivery-retry.ts` (both the local-docker branch ~lines 132-148 and the fly branch ~lines 158-173) against the execution env in `src/inngest/lifecycle/lib/machine-provisioner.ts` (local ~176-198, fly ~232-253, plus the `PLATFORM_ENV_MANIFEST` augmentation ~199-279).
  - For each field present in execution but absent in delivery, record a ruling (bug vs intentional) using the divergence table in this plan's Metis Review as the baseline. Confirm by reading the consumer:
    - `report-issue.ts:126` and `rotate-property-code.ts:181` → `requireEnv('TENANT_ID')` → proves #2 is a hard-exit bug for any delivery employee whose `tool_registry` includes those tools.
    - Check which P1 fields (#3 `ISSUES_SLACK_CHANNEL`, #4 `PLATFORM_ENV_MANIFEST`, #5 `archetype.worker_env`, #6 `NOTIFY_MSG_CHANNEL`) are actually consumed during delivery.
    - Confirm #8 (`EMPLOYEE_RULES`/`EMPLOYEE_KNOWLEDGE`/`REPLY_BROADCAST`) are execution-only and MUST NOT be added.
  - Output a concise ruling block (append to the plan's evidence or a scratch note) that Task 4 implements verbatim. Mark #7 (`MESSAGE_UID`/`OVERRIDE_DIRECTION`/`INPUT_*`) as P2-deferred.

  **Must NOT do**:
  - Do not write code changes in this task — analysis only.
  - Do not rule #8 fields as bugs.

  **Recommended Agent Profile**:
  - **Category**: `deep` — careful cross-file consumer tracing; correctness of the ruling gates Task 4.
  - **Skills**: [`inngest`, `data-access-conventions`] — lifecycle env assembly + worker-vs-repository env injection rules.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Blocked By**: None — **Blocks**: 4

  **References**:
  - `src/inngest/lifecycle/lib/machine-provisioner.ts:173-279` — full execution env + manifest logic (the reference shape).
  - `src/inngest/lifecycle/steps/delivery-retry.ts:127-175` — delivery env (both branches) — what's missing.
  - `src/worker-tools/platform/report-issue.ts:126` — `requireEnv('TENANT_ID')` consumer (#2 proof).
  - `src/worker-tools/sifely/rotate-property-code.ts:181` — second `requireEnv('TENANT_ID')` consumer.
  - Metis Review divergence table in this plan.

  **Acceptance Criteria**:
  - [ ] A written per-divergence ruling exists (bug/intentional + tier) covering #2–#8.
  - [ ] #8 explicitly ruled "do not add".

  **QA Scenarios**:

  ```
  Scenario: Ruling document produced and complete
    Tool: Bash
    Steps:
      1. Verify the ruling note exists at .sisyphus/evidence/task-3-divergence-rulings.md
      2. grep for each of TENANT_ID, NOTIFY_MSG_CHANNEL, worker_env, EMPLOYEE_RULES in the note
    Expected Result: note exists; all four terms present with a bug/intentional verdict
    Evidence: .sisyphus/evidence/task-3-divergence-rulings.md
  ```

  **Commit**: NO (analysis artifact only).

- [x] 4. Add `TENANT_ID`/`TASK_TENANT_ID` + P1 env parity to delivery env

  **What to do** (implement Task 3's rulings):
  - In `src/inngest/lifecycle/steps/delivery-retry.ts`, add to BOTH the local-docker env block and the fly env block:
    - `TENANT_ID: tenantId` and `TASK_TENANT_ID: tenantId` (P0-sibling #2 — closes the `requireEnv('TENANT_ID')` hard-exit). Note: `tenantId` is in `DeliveryRetryContext` — confirm it's destructured; if not, add it to the context interface and pass it from both callers in `no-approval-path.ts` and `approval-handler.ts`.
    - `NOTIFY_MSG_CHANNEL: notifyMsgRef?.channel ?? ''` (#6).
    - `...(archetype.worker_env as Record<string,string> | null ?? {})` spread (#5) — mirror the execution placement (after `tenantEnv`, before fixed vars).
    - `ISSUES_SLACK_CHANNEL` (#3) — fetch via `getPlatformSetting('issues_slack_channel')` as execution does, include only when truthy.
    - `PLATFORM_ENV_MANIFEST` augmentation (#4) — replicate the execution manifest pattern for the delivery-relevant critical vars (TASK_ID, TENANT_ID, EMPLOYEE_ROLE_NAME, APPROVAL_REQUIRED, NOTIFY_MSG_TS, NOTIFY_MSG_CHANNEL, plus any rawEvent UIDs already passed). Keep it minimal and delivery-appropriate.
  - Keep all changes confined to the delivery env builders.

  **Must NOT do**:
  - **Do NOT add `EMPLOYEE_RULES`, `EMPLOYEE_KNOWLEDGE`, or `REPLY_BROADCAST`** (intentional execution-only — #8).
  - **Do NOT add `MESSAGE_UID`/`OVERRIDE_DIRECTION`/`INPUT_*`** (#7 — deferred P2).
  - Do not refactor the env assembly into a shared `buildWorkerEnv()` (out of scope; regression risk).
  - Do not change execution-path env.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multi-field, two branches, must respect intentional asymmetries; needs care.
  - **Skills**: [`inngest`, `data-access-conventions`].

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5, after Task 3) — **Blocked By**: 3 — **Blocks**: 7

  **References**:
  - `src/inngest/lifecycle/steps/delivery-retry.ts:23-37` — `DeliveryRetryContext` (check `tenantId` present).
  - `src/inngest/lifecycle/steps/delivery-retry.ts:132-148,158-173` — the two env blocks to edit.
  - `src/inngest/lifecycle/lib/machine-provisioner.ts:232-279` — execution manifest pattern to mirror.
  - `src/inngest/lifecycle/steps/no-approval-path.ts:214-233` — caller of `runDeliveryWithRetry` (passes ctx; confirm `tenantId` flows).
  - Task 3 ruling note.

  **Acceptance Criteria**:
  - [ ] `TENANT_ID` + `TASK_TENANT_ID` present in both delivery env branches.
  - [ ] `NOTIFY_MSG_CHANNEL`, `archetype.worker_env` spread, `ISSUES_SLACK_CHANNEL`, `PLATFORM_ENV_MANIFEST` present per rulings.
  - [ ] None of the #8 fields present in delivery env.
  - [ ] `pnpm build` + `pnpm lint` clean.

  **QA Scenarios**:

  ```
  Scenario: TENANT_ID added, execution-only fields NOT added
    Tool: Bash
    Steps:
      1. Run: grep -n "TENANT_ID" src/inngest/lifecycle/steps/delivery-retry.ts
      2. Run: grep -nE "EMPLOYEE_RULES|EMPLOYEE_KNOWLEDGE|REPLY_BROADCAST" src/inngest/lifecycle/steps/delivery-retry.ts
    Expected Result: step 1 shows TENANT_ID + TASK_TENANT_ID in both branches; step 2 returns ZERO matches
    Evidence: .sisyphus/evidence/task-4-delivery-env.txt

  Scenario: Build and lint clean after env edits
    Tool: Bash
    Steps:
      1. Run: pnpm build && pnpm lint
    Expected Result: exit 0, no errors
    Evidence: .sisyphus/evidence/task-4-build-lint.txt
  ```

  **Commit**: groups with code commit.

- [x] 5. Unit test for the resolver — 4 combos + equivalence

  **What to do**:
  - Add a Vitest unit test (e.g. `tests/unit/worker-url-resolver.test.ts` or beside existing lifecycle lib tests — match the repo's unit test location convention) for `resolveWorkerSupabaseUrl`.
  - Mock `getTunnelUrl` and control `WORKER_RUNTIME`/`process.env.TUNNEL_URL`. Cases:
    1. `WORKER_RUNTIME=fly`, `TUNNEL_URL` UNSET → returns the passed `supabaseUrl`, does NOT throw, `getTunnelUrl` NOT called. **(regression lock for the incident)**
    2. `WORKER_RUNTIME=fly`, `TUNNEL_URL='https://tunnel.example'` → returns tunnel URL, `getTunnelUrl` called once. **(hybrid mode preserved)**
    3. `WORKER_RUNTIME` unset/`docker`, `TUNNEL_URL` unset → returns `supabaseUrl`, `getTunnelUrl` NOT called.
    4. `WORKER_RUNTIME` unset/`docker`, `TUNNEL_URL` set → returns `supabaseUrl` (runtime gate wins), `getTunnelUrl` NOT called. **(edge case)**
  - Equivalence assertion: for a fixed `(WORKER_RUNTIME, TUNNEL_URL, supabaseUrl)` triple, the value the helper returns is what both call sites use (assert by calling the single helper — proving there is one source). Document in a comment that this is the de-duplication guarantee.
  - Note: `WORKER_RUNTIME` is imported as a const in `config.ts`; if it's evaluated at import time, structure the test to mock the config module or the env before import (follow existing config-mocking patterns in the repo's unit tests).

  **Must NOT do**:
  - Do not hit the network or real env; fully deterministic.

  **Recommended Agent Profile**:
  - **Category**: `quick` — focused unit test.
  - **Skills**: [`inngest`].

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4, after Task 1) — **Blocked By**: 1 — **Blocks**: 7

  **References**:
  - Task 1 helper.
  - `src/lib/tunnel-client.ts:18-27` — `getTunnelUrl` to mock.
  - `tests/unit/` — existing unit tests for config/env-mocking patterns to mirror.

  **Acceptance Criteria**:
  - [ ] 4 cases + equivalence assertion present.
  - [ ] `pnpm test:unit` passes, new file appears in output, 0 failures.

  **QA Scenarios**:

  ```
  Scenario: Resolver test passes including the incident-regression case
    Tool: Bash
    Steps:
      1. Run: pnpm test:unit
      2. Confirm the resolver test file is listed and all its cases pass
    Expected Result: 0 failures; case "fly + TUNNEL_URL unset returns supabaseUrl, no throw" passes
    Evidence: .sisyphus/evidence/task-5-unit-test.txt
  ```

  **Commit**: groups with code commit.

- [x] 6. Update production-debugging guide + drift-audit doc

  **What to do**:
  - In `docs/guides/2026-06-01-2246-production-debugging-guide.md`, "Bug 1" section: add a note that the Jun-7 refactor (commit `751c9b19`, "extract step modules") re-introduced the UNGUARDED `getTunnelUrl()` line in the delivery path (`delivery-retry.ts`), causing tasks to hang in `Delivering`; document the permanent fix = single shared `resolveWorkerSupabaseUrl()` helper used by both provisioners, and that the symptom is "stuck at Delivering, failure_reason NULL, 0 Fly machines, app suspended (cosmetic)".
  - In `docs/guides/2026-06-12-2030-drift-audit.md`: record execution-vs-delivery worker-env assembly as a duplicated-platform-fact class; note the new single source (the resolver) and that remaining env-parity items (#7) are a tracked follow-up.
  - Follow markdown timestamp/naming conventions for any new content; do not create new files (edit existing).

  **Must NOT do**:
  - Do not invent a watchdog recommendation.
  - Do not duplicate the full root-cause analysis into both docs — link/cross-reference concisely.

  **Recommended Agent Profile**:
  - **Category**: `writing` — doc accuracy + concision.
  - **Skills**: [`production-ops`].

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Blocked By**: None — **Blocks**: (ties to F1)

  **References**:
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md` Bug 1 (lines ~353-377).
  - `docs/guides/2026-06-12-2030-drift-audit.md`.
  - This plan's Context + Root Cause sections.

  **Acceptance Criteria**:
  - [ ] Both docs mention the delivery-path recurrence and the shared-resolver single source.

  **QA Scenarios**:

  ```
  Scenario: Docs updated with the recurrence note
    Tool: Bash
    Steps:
      1. Run: grep -n "delivery-retry\|resolveWorkerSupabaseUrl\|751c9b19" docs/guides/2026-06-01-2246-production-debugging-guide.md
      2. Run: grep -n "resolveWorkerSupabaseUrl\|delivery" docs/guides/2026-06-12-2030-drift-audit.md
    Expected Result: both greps return at least one match
    Evidence: .sisyphus/evidence/task-6-docs.txt
  ```

  **Commit**: docs commit (see Commit Strategy).

- [x] 7. Local gate — build + lint + test + grep assertions

  **What to do**:
  - Run the full local gate and confirm all green BEFORE merge:
    - `pnpm build`
    - `pnpm lint`
    - `pnpm test:unit` (0 failures; remember `container-boot.test.ts` skips are expected, not failures)
    - `grep -rn "WORKER_RUNTIME === 'fly'" src/inngest | grep getTunnelUrl` → only the helper.
  - Stage + commit the code changes (Tasks 1,2,4,5) and docs (Task 6) per Commit Strategy. Do NOT use `--no-verify`.

  **Must NOT do**:
  - Do not skip pre-commit hooks.
  - Do not merge if any gate is red.

  **Recommended Agent Profile**:
  - **Category**: `quick` — mechanical gate + commit.
  - **Skills**: [`git-master`].

  **Parallelization**:
  - **Can Run In Parallel**: NO — **Blocked By**: 2, 4, 5 (and 6 for docs) — **Blocks**: 8

  **References**:
  - AGENTS.md "Commands" table; Commit Strategy in this plan.

  **Acceptance Criteria**:
  - [ ] build/lint/test all green; grep assertion holds; changes committed.

  **QA Scenarios**:

  ```
  Scenario: Full local gate green
    Tool: Bash
    Steps:
      1. Run: pnpm build && pnpm lint && pnpm test:unit
      2. Run: grep -rn "WORKER_RUNTIME === 'fly'" src/inngest | grep getTunnelUrl
    Expected Result: step 1 exits 0 with 0 test failures; step 2 returns only the helper file
    Evidence: .sisyphus/evidence/task-7-local-gate.txt
  ```

  **Commit**: YES (this task performs the commits).

- [x] 8. Confirm deploy `live`, then prod E2E re-trigger (REAL E2E — mandatory)

  **What to do**:
  - **Gate first**: poll Render until the gateway deploy that includes this fix is `live`:
    `curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/services/srv-d8f1b2gg4nts738dj7jg/deploys?limit=1" | jq '.[0].deploy.status'` → must be `live`. Do NOT proceed otherwise. (Deploy ships via merge to `main` → CI `deploy-gateway`; the fix is in `src/inngest/` = gateway process.)
  - **Trigger a FRESH task**:
    `curl -s -X POST -H "Authorization: Bearer $SERVICE_TOKEN" "https://ai-employees-laaa.onrender.com/admin/tenants/c7e5b720-301c-4aa5-b4b7-464fb1909ac0/employees/slack-channel-summarizer/trigger" -H "Content-Type: application/json" -d '{}'` → capture the new `task_id`.
  - **Assert** (use PG17 psql session pooler, port 5432):
    - New task reaches `tasks.status = 'Done'` (poll up to a few minutes).
    - `task_status_log` shows `Submitting → Delivering → Done`.
    - A `employee-delivery-<8>` machine spawned (Fly Machines API) — proving the path no longer throws pre-machine.
    - A message was posted to Slack channel `C05UL7X6B54` (not stuck on "Processing").
  - Record task ID, status-log trace, and Slack evidence.

  **Must NOT do**:
  - Do not run before deploy `live`.
  - Do not accept "unit tests pass" as a substitute (AGENTS.md mandates live delivery E2E).
  - Do not hardcode secrets in committed files — read from `.env` / skills.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multi-system prod verification.
  - **Skills**: [`production-ops`, `execution-trace-debugging`, `feature-verification`].

  **Parallelization**:
  - **Can Run In Parallel**: NO — **Blocked By**: 7 (merged + deployed) — **Blocks**: 9

  **References**:
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md` — Render deploy poll, Fly machine list, prod DB connection (port 5432, PG17).
  - This plan's "Production access reference".
  - Notification channel `C05UL7X6B54`, tenant `c7e5b720-...`.

  **Acceptance Criteria**:
  - [ ] Deploy confirmed `live` before trigger.
  - [ ] Fresh task `Done` with `Submitting → Delivering → Done` trace.
  - [ ] `employee-delivery-*` machine spawned; Slack message posted to `C05UL7X6B54`.

  **QA Scenarios**:

  ```
  Scenario: Fresh prod task delivers end-to-end
    Tool: Bash (curl + psql + Fly API)
    Steps:
      1. Confirm Render deploy status == "live"
      2. POST the trigger; capture new task_id
      3. Poll prod DB: SELECT status FROM tasks WHERE id='<new>'; until Done (or fail after timeout)
      4. SELECT from_status,to_status FROM task_status_log WHERE task_id='<new>' ORDER BY created_at
      5. Fly: list machines, confirm employee-delivery-<8> existed
    Expected Result: status Done; trace includes Submitting->Delivering->Done; delivery machine present; Slack post visible in C05UL7X6B54
    Evidence: .sisyphus/evidence/task-8-prod-e2e.txt

  Scenario: Negative — verify the OLD failure mode is gone
    Tool: Bash
    Steps:
      1. After the fresh task reaches Done, confirm it did NOT dwell in Delivering > 5 min (compare Delivering and Done timestamps in status-log)
    Expected Result: Delivering->Done gap is well under the old 27-min hang
    Evidence: .sisyphus/evidence/task-8-no-hang.txt
  ```

  **Commit**: NO (verification only).

- [x] 9. Remediate the live stuck task `635a62f9`

  **What to do**:
  - Only AFTER Task 8 proves the fix live. The stuck task's execution output is gone (container destroyed), so it cannot resume `Delivering`.
  - Mark it terminal in prod DB with a clear reason and log the transition:
    - `UPDATE tasks SET status='Failed', failure_reason='Abandoned at Delivering due to delivery-path getTunnelUrl throw (fixed); superseded by re-triggered task', failure_code='MANUAL_REMEDIATION', updated_at=now() WHERE id='635a62f9-c419-4b37-b68b-dbd06ebba056' AND status='Delivering';`
    - Insert a `task_status_log` row `Delivering → Failed`, actor `manual-remediation`.
  - The fresh task from Task 8 already serves the teammate's actual need; reference its ID in the failure reason if desired.
  - Optionally update the frozen Slack notify message to ❌ if `notify_slack_ts`/`notify_slack_channel` are in the task metadata (non-fatal if skipped).

  **Must NOT do**:
  - Do not attempt to resume/re-dispatch the SAME run (Inngest memoization would replay the throw; output is gone).
  - Do not run before Task 8.
  - Do not hard-delete the row (soft-state only — set status, never DELETE).

  **Recommended Agent Profile**:
  - **Category**: `quick` — targeted DB remediation.
  - **Skills**: [`production-ops`, `debugging-lifecycle`].

  **Parallelization**:
  - **Can Run In Parallel**: NO — **Blocked By**: 8 — **Blocks**: F-wave

  **References**:
  - Task in question: `635a62f9-c419-4b37-b68b-dbd06ebba056`, tenant `c7e5b720-...`.
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md` — prod DB connection.
  - `debugging-lifecycle` skill — status-log actor conventions.

  **Acceptance Criteria**:
  - [ ] `635a62f9` is `Failed` with a clear `failure_reason`; status-log has the `Delivering → Failed` row.

  **QA Scenarios**:

  ```
  Scenario: Stuck task is terminal, not dangling
    Tool: Bash (psql)
    Steps:
      1. SELECT status, failure_reason FROM tasks WHERE id='635a62f9-c419-4b37-b68b-dbd06ebba056';
      2. SELECT from_status,to_status,actor FROM task_status_log WHERE task_id='635a62f9-...' ORDER BY created_at DESC LIMIT 1;
    Expected Result: status=Failed with clear reason; latest log row Delivering->Failed actor manual-remediation
    Evidence: .sisyphus/evidence/task-9-remediation.txt
  ```

  **Commit**: NO (prod data remediation).

- [x] 10. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.
      Run: `tsx scripts/telegram-notify.ts "✅ delivery-tunnel-url-rootfix complete — root cause fixed (shared URL resolver), prod E2E passed, stuck task remediated. Come back to review."`
      **Blocked By**: F-wave + user okay. **Category**: `quick`.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1-F4 checked before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read this plan end-to-end. For each "Must Have": verify implementation (read the helper, read both call sites, query prod task state). For each "Must NOT Have": search the codebase — reject with file:line if `EMPLOYEE_RULES`/`EMPLOYEE_KNOWLEDGE`/`REPLY_BROADCAST` were added to delivery env, if a watchdog was added, or if a full `buildWorkerEnv()` refactor was done. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit`. Review changed files for `as any`/`@ts-ignore`, dropped `await` on the async helper, sync-vs-async mistakes, generic names. Confirm the helper is the ONLY place the fly/tunnel ternary exists.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Prod QA Replay** — `unspecified-high`
      Independently re-run the prod E2E: confirm deploy `live`, trigger a fresh summarizer task, assert `Done` + Slack post to `C05UL7X6B54` + spawned `employee-delivery-*` machine + full status-log trace. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Deploy [live] | Task [Done] | Slack [posted] | Machine [spawned] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Diff the actual changes (git). Verify ONLY: the shared helper, both call-site rewires, the delivery env P0/P1 additions, the unit test, and the two doc updates were changed. Flag any execution-path behavioral change, any P2 (#7) work, any intentional-asymmetry field added to delivery, or any unrelated file touched.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Code (T1,T2,T4,T5)**: `fix(lifecycle): route delivery through shared worker URL resolver and close env divergences` — `src/inngest/lifecycle/lib/*`, `src/inngest/lifecycle/steps/delivery-retry.ts`, test file. Pre-commit: `pnpm test:unit && pnpm lint`.
- **Docs (T6)**: `docs: record delivery-path tunnel-URL recurrence and shared-resolver single source` — the two guides.
- Deploy is via merge to `main` → CI `deploy-gateway` (Render). The bug is in `src/inngest/` (gateway process), so the Render gateway deploy is what ships the fix; the Fly worker image rebuild is orthogonal.

---

## Success Criteria

### Verification Commands

```bash
# 1. Only the helper contains the ternary
grep -rn "WORKER_RUNTIME === 'fly'" src/inngest | grep "getTunnelUrl"   # Expected: only the helper file

# 2. Unit + build + lint
pnpm test:unit   # Expected: 0 failures, resolver test present
pnpm build && pnpm lint   # Expected: clean

# 3. Prod fresh task reaches Done (after deploy live)
#    psql session pooler: SELECT status FROM tasks WHERE id='<new>';  -> Done
#    status-log shows Submitting -> Delivering -> Done
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (no watchdog, no execution-only fields in delivery, no mega-refactor)
- [ ] Resolver unit test green; both call sites use the helper
- [ ] Prod fresh task `Done` + Slack posted; stuck task no longer dangling
- [ ] Docs updated
