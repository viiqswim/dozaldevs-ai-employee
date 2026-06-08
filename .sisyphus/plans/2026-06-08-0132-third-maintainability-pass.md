# Third Maintainability Pass — Pre-Onboarding Hardening

## TL;DR

> **Quick Summary**: Close the remaining maintainability gaps that two prior passes left behind — finish the PARTIAL foundation adoption (config, HTTP client, Hostfully tool client) so new hires copy the RIGHT pattern, author the missing `sendSuccess()` and adopt it, decompose the large files that emerged after the last decomposition, decompose + dedup the dashboard (deferred until now), drop 5 dead forward-compat Prisma tables, and codify the remaining conventions. All extract-only / pass-through — zero externally-observable behavior change.
>
> **Deliverables**:
>
> - **Foundations finished**: `sendSuccess()` authored (pass-through) + adopted in all gateway success responses; `createHttpClient` extended with `.get()/.delete()` + adopted in fly/telegram/github-token clients; central config expanded + 4 OAuth routes + `shared.ts` migrated; 8 remaining Hostfully tools migrated to the shared client/paginator
> - **Backend large-file decomposition** (extract-only): `validate-and-submit.ts` (1109→~150), `opencode-harness.mts` helpers extracted, `approval-handler.ts` `handleReject` extracted, gateway `override-handlers.ts` extracted, plus dedup of repeated cleanup/metric/guard blocks
> - **Cross-module fix**: tenant repos + loader moved to a neutral shared layer (removes the `inngest → gateway/services` `../../../` smell)
> - **Dashboard**: dead `InputSchemaEditor` deleted, shared primitives extracted, `fireHostfullyWebhook`/`useSlackChannels` deduped, `ModelCatalogPage`/`EmployeeDetail`/`EmployeeList`/`CreateEmployeePage`/`CompactSettingsGrid` decomposed
> - **Schema cleanup**: 5 dead forward-compat tables dropped via dependency-ordered migration (backup + row-audit + PostgREST verify)
> - **Conventions codified**: magic numbers named; barrel-file policy documented; catch-handler + `as unknown as` exceptions documented (not changed); 2 `console.*` → logger; AGENTS.md/CONTRIBUTING updated
>
> **Estimated Effort**: XL (40 tasks across 6 waves + final verification) — each wave independently shippable
> **Parallel Execution**: YES — 6 ordered waves; tasks within a wave parallelize
> **Critical Path**: foundation helpers (sendSuccess, http-client.get/delete) → backend decomp + harness rebuild + one Tier B → schema DROP (isolated, backed-up) → dashboard decomp (Playwright parity) → conventions/docs → final wave

---

## Context

### Original Request

After two completed maintainability plans (`2026-06-05-0111-maintainability-remediation.md`, `2026-06-07-1653-onboarding-readiness.md`), analyze the codebase one more time and find where else to improve structure/maintainability before new engineers onboard next week — so they have clear patterns to follow and avoid copying bad ones.

### What the two prior plans already did (do NOT redo)

- **Plan 1**: active bug fixes, deleted ~5K dead lines, unified `TERMINAL_STATUSES`, built shared foundations (config, logger, `sendError`, `http-client`, Hostfully client PoC), FK-index + `deleted_at` migrations, decomposed the then-biggest files, unified the approval flow.
- **Plan 2**: fixed 61 failing tests, split `tests/unit/` + `tests/integration/`, contributor guide + PR template + husky, typed PostgREST + Inngest events, `employee-lifecycle.ts` → 88 lines, `sendError` in all 29 routes, migrated 54 worker tools, ESLint `no-explicit-any` = error.

### Research Findings (4 parallel explore agents + Metis, file:line precise)

This pass targets only what those plans **deferred** or what **emerged after** them. Source draft: `.sisyphus/drafts/2026-06-08-0132-third-maintainability-pass.md`.

### Metis Review — corrections that reshaped the plan (CRITICAL)

- **`sendSuccess()` does NOT exist** in `src/gateway/lib/http-response.ts` (only `sendError`). AGENTS.md's "paired with `sendSuccess()`" is doc rot. → Must **author** it (pass-through, byte-identical) before any migration.
- **The "54" `res.status().json()` count is stale** (Metis found 58 in gateway alone). → Re-derive: separate **2xx success** calls (→`sendSuccess`) from any remaining **error** calls (→`sendError`).
- **The vitest "coverage mis-nest" bug is NOT real** — `vitest.config.ts:19` has `coverage` correctly nested under `test:`. The earlier LSP error was a transient false alarm. → **Dropped from scope.**
- **Prisma DROP is FK-interlinked**, not isolated: `Review→Deliverable`, `Review→AgentVersion`, `AuditLog→AgentVersion/Task`, `ValidationRun→Execution`, `CrossDeptTrigger→Task`, `Clarification→Task`. `AuditLog` maps to table **`audit_log`** (singular, no `s`). `AgentVersion` + `Deliverable` are referenced by ACTIVE models (`Archetype`, `Execution`) — they are NOT in the drop set. → Drop only the 5 confirmed-dead leaves; row-audit + backup + leaf→root order + PostgREST verify.
- **Worker-tool false positive**: `src/worker-tools/hostfully/get-reviews.ts` matches "reviews" but reads the **Hostfully API**, not our `reviews` table. Safe — but the executor must disambiguate.
- **`as unknown as` (12) + catch handlers = DOCUMENT-ONLY** (Bolt handlers must not throw; changing them alters error propagation). NOT refactors.
- **Config migration of `server.ts` startup is OUT of scope** unless config stays lazy/non-throwing — preserves startup-failure ordering. Migrate the 4 OAuth routes + `shared.ts` only.
- **Barrel-file policy = document only**; do NOT add new `index.ts` barrels (import-resolution / circular-dep risk).
- **Dashboard parity must be proven via Playwright** (only 4 dashboard tests exist) — not unit tests, not net-new component tests.

---

## Work Objectives

### Core Objective

Finish the partially-adopted shared foundations, decompose the newly-grown large files, decompose + dedup the dashboard, drop dead schema tables, and codify the remaining conventions — so a new engineer reading the codebase sees ONE consistent pattern everywhere, with zero externally-observable behavior change.

### Concrete Deliverables

See TL;DR. Every task maps to a finding in the source draft.

### Definition of Done

- [ ] `pnpm build && pnpm lint && pnpm test -- --run && pnpm test:integration && pnpm dashboard:build` all green
- [ ] `sendSuccess()` exists, unit-tested for byte-identical output, and used for gateway 2xx responses (zero raw `res.status(2xx).json()` in routes)
- [ ] `createHttpClient` exposes `.get()/.delete()`; fly/telegram/github-token clients use it
- [ ] 8 remaining Hostfully tools use `resolveHostfullyClient()` (+ paginator where applicable)
- [ ] No `inngest/**` file imports from `gateway/services/` via relative path
- [ ] Dead `dashboard/src/components/InputSchemaEditor.tsx` deleted (LSP-verified zero refs); no decomposed dashboard page > ~300 lines
- [ ] 5 dead tables dropped; PostgREST 404s them and still resolves surviving tables
- [ ] `real-estate-motivation-bot-2` reaches `Done` after every lifecycle/harness change; Tier B passes after approval-path file splits

### Must Have

- Each wave independently shippable
- Every extraction is behavior-identical (extract-only); every `sendSuccess` migration is body-identical (pass-through)
- DB migration preceded by backup + row-audit; followed by PostgREST reload + curl verify
- Harness change followed by Docker rebuild + live worker run

### Must NOT Have (Guardrails from Metis)

- **NO behavior change of any kind** during extractions — a bug found mid-extraction becomes a NEW finding, never an inline fix
- **NO response-body shape change** in the `sendSuccess` migration — pass-through identical to `res.status(n).json(body)`
- **NO migration of `server.ts`'s 14 startup-validation `process.env` reads** (preserves startup-failure ordering)
- **NO changing** any catch handler or `as unknown as` cast — those are **document-only**
- **NO new `index.ts` barrels** — document the policy only
- **NO net-new dashboard component tests** — prove parity with Playwright visual/smoke
- **NO dropping `AgentVersion`, `Deliverable`, `Execution`** or any table referenced by an active model — only the 5 confirmed-dead leaves
- **NO hand-written DROP migration** — generate via `prisma migrate dev`, inspect the SQL for `CASCADE` (CASCADE = a missed dependency, STOP)
- **NO splitting** `slack-blocks.ts`, `tool-parser.ts`, `session-manager.ts` (cohesive)
- **NO tuning** any magic number while naming it (naming only; value byte-identical)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed. Reuses the proven Tier S/A/B model from the two prior plans.

### Test Decision

- **Infrastructure exists**: YES (split `tests/unit/` parallel + `tests/integration/` DB-backed; dashboard Vitest + Playwright-over-CDP)
- **Automated tests**: Tests-after for extractions (existing tests stay green); NEW unit tests for new shared modules (`sendSuccess`, extended `createHttpClient`, the relocated tenant-repo barrel)
- **Framework**: `vitest` (root + dashboard) + Playwright over CDP for dashboard parity
- **No new framework needed.**

### QA Policy

Every task gates on its assigned tier (Verification Tier Map below) and captures evidence to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Tier S** — Smoke: `pnpm build && pnpm lint && pnpm test -- --run` (+ `pnpm dashboard:build` for dashboard tasks) + the task-specific grep/assertion. For pure-doc/config tasks, this is the full gate.
- **Tier A** — Fast runtime: Tier S, then trigger `real-estate-motivation-bot-2` (VLRE, `approval_required:false`) → `Done` (psql AND PostgREST) + `task_metrics` row + Slack post.
- **Tier B** — Full approval loop: Tier A, then the real Airbnb→draft→Slack-card→approve→reply→DB loop (or simulate the Hostfully webhook per README). Single-gateway pre-flight (`pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` == 1) required first.
- **Dashboard parity** — Playwright over CDP (real Chrome): before/after screenshot per decomposed page, zero console errors, one named primary interaction per page. `lsp_find_references` before any dashboard deletion.
- **DB migration** — backup → row-audit → `prisma migrate dev` (inspect SQL) → apply → `NOTIFY pgrst, 'reload schema'` → curl: dropped tables 404, surviving tables return `[]`.
- **Harness change** — `docker build -t ai-employee-worker:latest .` → trigger `real-estate-motivation-bot-2` → `Done` + metrics row.

---

## Execution Strategy

> **6 ordered, independently-shippable waves.** Tasks within a wave parallelize. Every task ends with its tier gate + captured evidence.

### Wave Map

```
WAVE 1 — Foundation helpers + cheap wins (unblocks Bucket C; ship-safe)
├── 1. Author + unit-test sendSuccess() (pass-through) ........... [BLOCKS 14,15]
├── 2. Extend createHttpClient with .get()/.delete() + tests ..... [BLOCKS 6,7]
├── 3. Expand src/lib/config.ts (lazy constants for shared clusters)
├── 4. Move 2 console.* → logger (verify logger works in context)
└── 5. Re-derive res.status() migration set (success vs error inventory) [feeds 14,15]
   ↳ CHECKPOINT W1: build/test/lint green; helpers exist + unit-tested

WAVE 2 — Finish foundation adoption (new devs copy the RIGHT pattern)
├── 6. Adopt createHttpClient in fly-client.ts (depends 2)
├── 7. Adopt createHttpClient in telegram-client + github-token-manager (depends 2)
├── 8. Migrate 4 OAuth routes + shared.ts to config (depends 3)
├── 9. Migrate 3 Hostfully list tools → client + paginator
├── 10. Migrate 5 Hostfully single/write tools → client (+ get-property optionalEnv fix)
└── 11. Extract tenant repos + loader → neutral shared layer (removes inngest→gateway smell)
   ↳ CHECKPOINT W2: Tier A green; no inngest→gateway relative import

WAVE 3 — Backend large-file decomposition (extract-only) + ONE rebuild + ONE Tier B
├── 12. Decompose validate-and-submit.ts (1109→~150) + dedup cleanup/metric blocks
├── 13. Decompose approval-handler.ts (extract handleReject) + dedup writeFeedbackEvent
├── 14. Adopt sendSuccess in route group 1 (depends 1,5)
├── 15. Adopt sendSuccess in route group 2 (depends 1,5)
├── 16. Extract gateway override-handlers.ts + handleAlreadyProcessed guard (depends nothing in W3)
├── 17. Extract opencode-harness.mts helpers + remove dead opencodeRunPid branch
├── 18. Extract slack-input-collector.ts + interaction-handler early-exits
   ↳ CHECKPOINT W3: docker rebuild → Tier B (covers 12,13,16,17) → green

WAVE 4 — Schema cleanup (HIGH-RISK, isolated, backed-up)
├── 19. Backup DB + row-audit + worker-tool table-name disambiguation
└── 20. Drop 5 dead tables (prisma migrate dev, leaf→root) + PostgREST verify
   ↳ CHECKPOINT W4: dropped tables 404 via PostgREST; survivors resolve; Tier A green

WAVE 5 — Dashboard dedup + decomposition (Playwright parity)
├── 21. Delete dead InputSchemaEditor + extract input-schema-shared.ts (LSP-verified)
├── 22. Add fireHostfullyWebhook to gateway.ts; remove 3 raw-fetch copies
├── 23. Extract useSlackChannels hook
├── 24. Decompose ModelCatalogPage (910→~200)
├── 25. Decompose EmployeeDetail (641→~200)
├── 26. Decompose EmployeeList (606→~200)
├── 27. Decompose CreateEmployeePage (612→~200)
└── 28. Decompose CompactSettingsGrid (reducer + hook)
   ↳ CHECKPOINT W5: dashboard:build green; Playwright parity per page

WAVE 6 — Conventions, docs & final wave (ship last)
├── 29. Name magic numbers (execute.ts, opencode-server.ts, session-manager, validate-and-submit)
├── 30. Document barrel-file policy + catch-handler + as-unknown-as exceptions (CONTRIBUTING)
├── 31. Fix AGENTS.md sendSuccess doc rot + document knowledge_base naming exception
├── 32. Update AGENTS.md/README/CONTRIBUTING for new modules + dropped tables + relocated repos
└── 33. Final Verification Wave (F1-F4) + docs freshness + git cleanup + Telegram notify
   ↳ CHECKPOINT W6: full E2E; docs current; F1-F4 APPROVE + user okay

Critical Path: 1 → 5 → 14/15 ; 2 → 6/7 ; 12/13/16/17 → rebuild → Tier B → 19 → 20 → 21..28 → 33
```

### Dependency Notes

- **1 (author sendSuccess) + 5 (inventory) block 14/15** (the migration).
- **2 (extend http-client) blocks 6/7.**
- **3 (config expand) blocks 8.**
- **Wave 3 lands all approval/harness/lifecycle extractions, THEN one Docker rebuild, THEN one Tier B** covers 12/13/16/17 together (Metis: same Tier B run if same wave).
- **Wave 4 (DROP) is isolated and backed-up** — run after Wave 3 so the schema change doesn't confound the extraction Tier B.
- **11 (tenant-repo move) touches both inngest + gateway imports** — do before Wave 3's lifecycle extractions touch the same files where practical; if 11 and 12/13 both edit `approval-handler.ts` imports, sequence 11 first.

### Verification Tier Map

| Task                      | Tier                           | Task                     | Tier               | Task                      | Tier           |
| ------------------------- | ------------------------------ | ------------------------ | ------------------ | ------------------------- | -------------- |
| 1 sendSuccess             | S (parity test)                | 12 validate-and-submit   | **B**              | 23 useSlackChannels       | S (Playwright) |
| 2 http-client get/delete  | S                              | 13 approval-handler      | **B**              | 24 ModelCatalogPage       | S (Playwright) |
| 3 config expand           | S                              | 14 sendSuccess grp1      | A                  | 25 EmployeeDetail         | S (Playwright) |
| 4 console→logger          | A (tool-parser is worker path) | 15 sendSuccess grp2      | A                  | 26 EmployeeList           | S (Playwright) |
| 5 res.status inventory    | S                              | 16 override-handlers     | **B**              | 27 CreateEmployeePage     | S (Playwright) |
| 6 fly-client              | A                              | 17 harness helpers       | **B** + rebuild    | 28 CompactSettingsGrid    | S (Playwright) |
| 7 telegram/github client  | A                              | 18 slack-input-collector | A                  | 29 magic numbers          | S              |
| 8 OAuth+shared config     | A                              | 19 backup+row-audit      | S                  | 30 barrel/catch docs      | S              |
| 9 hostfully list tools    | A                              | 20 DROP migration        | **A** + PostgREST  | 31 AGENTS sendSuccess fix | S              |
| 10 hostfully single tools | A                              | 21 InputSchemaEditor     | S (Playwright+LSP) | 32 docs update            | S              |
| 11 tenant-repo move       | A                              | 22 fireHostfullyWebhook  | S (Playwright net) | 33 final wave             | **B** (full)   |

---

## TODOs

> Every task references the source draft findings. **Extractions are extract-only; sendSuccess is pass-through; catch/as-unknown-as are document-only.** Re-grep line numbers before editing — they drift.
>
> **MANDATORY E2E GATE ON EVERY TASK**: run the task's assigned tier (Verification Tier Map) and capture evidence before starting the next task. If a gate fails, STOP and fix/revert.

### WAVE 1 — Foundation helpers + cheap wins

- [x] 1. **Author + unit-test `sendSuccess()` (pass-through)** `[BLOCKS 14,15]`

  **What to do**: `src/gateway/lib/http-response.ts` currently exports ONLY `sendError` (22 lines). Add `sendSuccess(res, status, body?)` that produces **byte-identical** output to `res.status(status).json(body)` — i.e. `res.status(status).json(body)` when a body is given, and `res.status(status).end()` (or `.json(undefined)` matching current 204/empty behavior — match whatever the routes currently do for empty success). Mirror the JSDoc style of `sendError`. Add a unit test in `tests/unit/gateway/http-response.test.ts` asserting `JSON.stringify` of `sendSuccess(res,200,body)` === the body for a representative object, an array, and a 201-created case, and that `sendSuccess(res,204)` sends no body.
  **Must NOT do**: Wrap the body in any envelope (`{ data }`, `{ success: true }`) — pass-through ONLY. This is the #1 scope-creep trap (would break the dashboard's `res.json()` parsing). Don't migrate any route yet (Tasks 14/15).
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 1. Blocks: 14, 15. Blocked By: none.
  **References**: `src/gateway/lib/http-response.ts:14-21` (`sendError` shape to mirror); `tests/unit/gateway/` (test location convention); AGENTS.md "`sendSuccess()` for ALL route 2xx" (the doc that's currently false).
  **Acceptance Criteria** (Tier S):
  - [ ] `grep -c "export function sendSuccess" src/gateway/lib/http-response.ts` → 1
  - [ ] **Parity test**: `pnpm test:file tests/unit/gateway/http-response.test.ts` green; test asserts byte-identical output (no envelope). Evidence: `.sisyphus/evidence/task-1-parity.txt`
  - [ ] `pnpm build` clean
        **Commit**: YES — `feat(gateway): add pass-through sendSuccess helper with parity test`

- [x] 2. **Extend `createHttpClient` with `.get()`/`.delete()`** `[BLOCKS 6,7]`

  **What to do**: `src/lib/http-client.ts` currently exposes only `.post()`. Add `.get(path, opts?)` and `.delete(path, opts?)` reusing the SAME fetch + 429/`Retry-After` + `withRetry` machinery already present. Keep the existing `.post()` contract untouched. Add unit tests covering get/delete success + a 429-retry path.
  **Must NOT do**: Change the `.post()` signature or the retry/backoff behavior. Don't migrate any client yet (Tasks 6/7).
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 1. Blocks: 6, 7. Blocked By: none.
  **References**: `src/lib/http-client.ts` (current `.post()` + retry); `src/lib/retry.ts` (`withRetry`); `src/lib/fly-client.ts` (`makeRequest`/`makeRequestWithRetry` — the GET/DELETE shapes the new methods must support); `tests/unit/lib/` for the test.
  **Acceptance Criteria** (Tier S):
  - [ ] `HttpClient` interface exposes `get` + `delete`; `pnpm build` clean
  - [ ] New tests cover get/delete + 429 retry; `pnpm test -- --run` green
        **Commit**: YES — `feat(lib): add get/delete methods to createHttpClient`

- [x] 3. **Expand `src/lib/config.ts` with lazy constants for the repeated clusters**

  **What to do**: `config.ts` exports only 5 constants. Add lazily-read, typed constants (or `requireEnv`-backed getters that do NOT throw at import) for the clusters that repeat across routes: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY`, `ENCRYPTION_KEY`, `ADMIN_API_KEY`, `PORT`, and the OAuth quartet pattern (`SLACK_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `JIRA_CLIENT_ID/SECRET`, `NOTION_CLIENT_ID/SECRET`, plus each `*_REDIRECT_BASE_URL`). Provide them so Task 8 can import instead of reading `process.env` inline.
  **Must NOT do**: Make config throw at module import (would change gateway startup-failure timing — Metis RISK 3). Don't migrate `server.ts`'s 14 startup reads. Don't move `platform_settings` DB lookups into config.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 1. Blocks: 8. Blocked By: none.
  **References**: `src/lib/config.ts` (existing 5 constants + pattern); `src/lib/platform-settings.ts` (validation pattern, NOT to duplicate); the 4 OAuth routes (consumers in Task 8).
  **Acceptance Criteria** (Tier S):
  - [ ] New constants exported and lazy (importing `config.ts` with an unset var does NOT throw at import)
  - [ ] A unit test confirms lazy access; `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `feat(config): add lazy config constants for OAuth + supabase clusters`

- [x] 4. **Move 2 `console.*` calls to the logger**

  **What to do**: Replace `console.warn` at `src/gateway/services/tool-parser.ts:92` and `src/lib/telegram-client.ts:82` with the shared `createLogger(...)` warn. **FIRST verify the logger imports cleanly in each context** (tool-parser runs in the worker container path — confirm `src/lib/logger.ts` is available there; if NOT, leave the `console.*` and instead add a one-line comment explaining why console is intentional there).
  **Must NOT do**: Swap to logger if it isn't available in that runtime context (Metis); don't touch the legitimate `console.*` in CLI worker-tools.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 1. Blocks: none. Blocked By: none.
  **References**: `src/gateway/services/tool-parser.ts:92`; `src/lib/telegram-client.ts:82`; `src/lib/logger.ts` (`createLogger`).
  **Acceptance Criteria** (Tier A — tool-parser is on the worker/discovery path):
  - [ ] Each site uses the logger OR has a justifying comment; `grep -c "console\." src/gateway/services/tool-parser.ts src/lib/telegram-client.ts` reflects the change
  - [ ] `pnpm build && pnpm test -- --run` green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-4-tierA.txt`
        **Commit**: YES — `refactor: route stray console.warn through shared logger`

- [x] 5. **Re-derive the exact `res.status().json()` migration set (success vs error)**

  **What to do** (Metis: the "54" is stale — found 58 in gateway): Produce an inventory file `.sisyphus/evidence/task-5-res-status-inventory.txt` listing EVERY `res.status(...).json(...)` / `.send(...)` / `.end(...)` in `src/gateway/routes/*.ts` (non-test), classified as **SUCCESS (2xx → migrate to `sendSuccess`)** or **ERROR (4xx/5xx → should already be `sendError`; flag any stragglers)**. Also flag non-JSON success responses (redirects/HTML in `*-oauth.ts`, `github.ts`, `hostfully.ts`, `jira.ts`) which must NOT be migrated. This inventory drives the exact edit set for Tasks 14/15.
  **Must NOT do**: Edit any route here — inventory only. Don't classify redirects/HTML as migratable.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 1. Blocks: 14, 15. Blocked By: none.
  **References**: all `src/gateway/routes/*.ts`; `src/gateway/lib/http-response.ts` (target helper from Task 1).
  **Acceptance Criteria** (Tier S):
  - [ ] Inventory file lists per-file SUCCESS vs ERROR vs NON-JSON counts; total reconciles with `grep -rc "res\.status" src/gateway/routes/*.ts`
        **Commit**: NO (inventory artifact only; committed with Task 14)

> **CHECKPOINT W1** — `pnpm build && pnpm test -- --run && pnpm lint` green; `sendSuccess` + extended `createHttpClient` exist and are unit-tested; inventory captured. **Wave 1 independently shippable.**

### WAVE 2 — Finish foundation adoption

- [ ] 6. **Adopt `createHttpClient` in `fly-client.ts`** (depends 2)

  **What to do**: Replace `fly-client.ts`'s private `makeRequest()` + `makeRequestWithRetry()` (its own fetch + 429 + retry) with `createHttpClient(baseUrl, headers)` using the new `.get()/.post()/.delete()`. Keep the public `fly-client` API (function names, return shapes) IDENTICAL. This is the most-copied "wrong" pattern, so it's first.
  **Must NOT do**: Change any exported fly-client function signature or behavior; don't alter retry counts/backoff.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 7,8,9,10,11. Blocked By: 2.
  **References**: `src/lib/fly-client.ts` (`makeRequest`/`makeRequestWithRetry`); `src/lib/http-client.ts` (extended in Task 2); `src/lib/slack-client.ts` (the reference adopter); `tests/unit/lib/fly-client*` if present.
  **Acceptance Criteria** (Tier A — fly-client drives worker machine lifecycle):
  - [ ] `grep -c "makeRequestWithRetry" src/lib/fly-client.ts` → 0 (replaced); public API unchanged
  - [ ] `pnpm build && pnpm test -- --run` green; Tier A → `Done` (machine create/destroy path intact). Evidence: `.sisyphus/evidence/task-6-tierA.txt`
        **Commit**: YES — `refactor(lib): adopt shared http-client in fly-client`

- [ ] 7. **Adopt `createHttpClient` in `telegram-client.ts` + `github-token-manager.ts`** (depends 2)

  **What to do**: `telegram-client.ts` (inline fetch + manual 429/`Retry-After`) → `createHttpClient`. `github-token-manager.ts` (raw fetch, NO retry) → `createHttpClient` so the installation-token call gains 429 handling. Preserve both public APIs and the GitHub token 55-min cache logic.
  **Must NOT do**: Change the token cache TTL or JWT-signing logic; don't change telegram message formatting.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 6,8,9,10,11. Blocked By: 2.
  **References**: `src/lib/telegram-client.ts`; `src/gateway/services/github-token-manager.ts`; `src/lib/http-client.ts`.
  **Acceptance Criteria** (Tier A):
  - [ ] Neither file inlines its own 429 parsing; `pnpm build && pnpm test -- --run` green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-7-tierA.txt`
        **Commit**: YES — `refactor(lib): adopt shared http-client in telegram + github-token clients`

- [ ] 8. **Migrate 4 OAuth routes + `shared.ts` to central config** (depends 3)

  **What to do**: In `slack-oauth.ts`, `google-oauth.ts`, `jira-oauth.ts`, `notion-oauth.ts`, replace inline `process.env.{X}_CLIENT_ID/SECRET`, `ENCRYPTION_KEY`, `{X}_REDIRECT_BASE_URL`, `PORT` reads with imports from `config.ts` (Task 3). In `src/gateway/slack/handlers/shared.ts`, collapse the 4× repeated `SUPABASE_URL`/`SUPABASE_SECRET_KEY` reads to config imports. Re-grep line numbers first.
  **Must NOT do**: Touch `server.ts`'s 14 startup reads (out of scope, Metis RISK 3); don't change the OAuth redirect/HTML responses; don't change PostgREST URL construction in `shared.ts`.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 6,7,9,10,11. Blocked By: 3.
  **References**: `src/gateway/routes/slack-oauth.ts`, `google-oauth.ts`, `jira-oauth.ts`, `notion-oauth.ts`; `src/gateway/slack/handlers/shared.ts`; `src/lib/config.ts` (Task 3).
  **Acceptance Criteria** (Tier A — OAuth + Slack handlers are runtime paths):
  - [ ] `grep -c "process.env" src/gateway/routes/{slack,google,jira,notion}-oauth.ts` drops to redirect-base/PORT-only or 0; `shared.ts` SUPABASE reads via config
  - [ ] `pnpm build && pnpm test -- --run` green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-8-tierA.txt`
        **Commit**: YES — `refactor(gateway): read OAuth + supabase env via central config`

- [ ] 9. **Migrate 3 Hostfully LIST tools → shared client + paginator**

  **What to do**: Migrate `get-properties.ts`, `get-reservations.ts`, `get-reviews.ts` to `resolveHostfullyClient()` + `paginateCursor()` from `src/worker-tools/hostfully/lib/`. Replace their inline `apiKey`/`headers`/manual `for(;;)` cursor loops. **NOTE**: `get-reviews.ts` reads the Hostfully reviews API — unrelated to the Prisma `reviews` table (Wave 4); do not conflate.
  **Must NOT do**: Change any tool's output JSON shape; don't touch `hostfully/lib/`; keep `--help`/mock-mode behavior.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [`adding-shell-tools`, `hostfully-api`].
  **Parallelization**: Wave 2. Parallel w/ 6,7,8,10,11. Blocked By: none.
  **References**: `src/worker-tools/hostfully/get-messages.ts`+`get-checkouts.ts` (the 2 PoC adopters to mirror); `hostfully/lib/client.ts`+`paginate.ts`; `tests/**/hostfully/*`.
  **Acceptance Criteria** (Tier A):
  - [ ] The 3 tools import `resolveHostfullyClient` + `paginateCursor`; `grep -c "process.env\[" <each>` → 0
  - [ ] `pnpm exec tsx src/worker-tools/hostfully/get-properties.ts --help` exit 0; worker-tools hostfully tests green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-9-tierA.txt`
        **Commit**: YES — `refactor(tools): migrate hostfully list tools to shared client + paginator`

- [ ] 10. **Migrate 5 Hostfully single/write tools → shared client** (+ get-property optionalEnv fix)

  **What to do**: Migrate `get-property.ts`, `get-door-code.ts`, `update-door-code.ts`, `send-message.ts`, `register-webhook.ts` to `resolveHostfullyClient()` (single-item / write — no paginator). ALSO fix `get-property.ts`'s raw `process.env['HOSTFULLY_API_URL']` → `optionalEnv('HOSTFULLY_API_URL')`. `register-webhook.ts` keeps its ~20 legit CLI `console.*`.
  **Must NOT do**: Change output shapes or the write payloads; don't use `requireEnv` for the optional base-URL var.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [`adding-shell-tools`, `hostfully-api`].
  **Parallelization**: Wave 2. Parallel w/ 6,7,8,9,11. Blocked By: none.
  **References**: `src/worker-tools/hostfully/get-property.ts` (raw process.env to fix); `hostfully/lib/client.ts`; `src/worker-tools/lib/require-env.ts` (`optionalEnv`).
  **Acceptance Criteria** (Tier A):
  - [ ] The 5 tools import `resolveHostfullyClient`; `grep -n "process.env\['HOSTFULLY_API_URL'\]" src/worker-tools/hostfully/get-property.ts` → 0 (now `optionalEnv`)
  - [ ] One tool `--help` exit 0; `pnpm build`; worker-tools tests green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-10-tierA.txt`
        **Commit**: YES — `refactor(tools): migrate remaining hostfully tools to shared client`

- [ ] 11. **Extract tenant repos + loader → neutral shared layer** (removes inngest→gateway smell)

  **What to do**: `src/inngest/lifecycle/steps/approval-handler.ts` (and other inngest files) import `TenantRepository`/`TenantSecretRepository`/`loadTenantEnv` from `../../../gateway/services/` — an inngest→gateway relative import. Move these three modules to a NEUTRAL location both layers import cleanly. **FIRST verify the target doesn't pull gateway-only deps (Prisma) into the worker bundle** (Metis Q6): if these repos use Prisma, place them where the worker bundle won't load them — prefer `src/gateway/services/` staying the home but having inngest import via a re-export in `src/lib/` ONLY if dependency-clean; otherwise relocate to `src/repositories/`. Decide based on the dep graph and DOCUMENT the choice. Update all import sites via `lsp_rename`/grep.
  **Must NOT do**: Redesign the repo API (move-as-is); don't pull Prisma into a module the worker container loads; don't add a barrel that creates a circular dep.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 2. Do BEFORE Wave 3's lifecycle extractions touch the same imports. Blocked By: none.
  **References**: `src/gateway/services/tenant-repository.ts`, `tenant-secret-repository.ts`, `tenant-env-loader.ts`; importers: `src/inngest/lifecycle/steps/approval-handler.ts:14-16`, `src/inngest/employee-lifecycle.ts`; `src/workers/lib/postgrest-client.ts` (worker dep-graph reference — what the worker bundle loads).
  **Acceptance Criteria** (Tier A):
  - [ ] `grep -rln "gateway/services" src/inngest --include="*.ts" | grep -v node_modules` → empty
  - [ ] Chosen location documented (comment + CONTRIBUTING note); `pnpm build && pnpm test -- --run` green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-11-tierA.txt`
        **Commit**: YES — `refactor: relocate tenant repositories to neutral shared layer`

> **CHECKPOINT W2** — Tier A green; no `inngest → gateway/services` relative import; foundation patterns now adopted at the majority of call sites. **Wave 2 independently shippable.**

### WAVE 3 — Backend large-file decomposition (EXTRACT-ONLY) + ONE rebuild + ONE Tier B

> **Universal Wave-3 guardrail**: extract only. Before extracting any "verbatim" block, `ast_grep_search` / diff each occurrence to confirm it's truly identical (Metis: the 6× blocks may differ in surrounding context). A bug found mid-extraction = a NEW finding, never an inline fix.

- [ ] 12. **Decompose `validate-and-submit.ts` (1109 → ~150) + dedup cleanup/metric blocks**

  **What to do** (re-grep — lines drift): First extract the repeated blocks into `src/inngest/lifecycle/steps/lifecycle-helpers.ts`: `cleanupExecutionMachine(machineId, taskId)` (the `destroyMachine`/`stopLocalDockerContainer` try/catch repeated ~6× at ≈131,255,270,411,1103) and `safeRecordWorkMetric(...)` (the `recordWorkMetric` try/catch repeated ~6× at ≈196,244,374,559,604,1090) — only after diffing each to confirm identical. Then split the orchestrator into `no-approval-path.ts` (≈97-380), `override-card.ts` (≈382-659), `reviewing-path.ts` (≈662-983). `runValidateAndSubmit()` becomes a thin sequencer (~150 lines). Preserve ALL Inngest step IDs.
  **Must NOT do**: Change any step ID, branch behavior, Slack sequencing, or `waitForEvent` names. No logic changes.
  **Recommended Agent Profile**: Category `ultrabrain` (highest-risk lifecycle file); Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 3. Parallel w/ 13,16,17,18. Blocked By: 11 (if it touched these imports).
  **References**: `src/inngest/lifecycle/steps/validate-and-submit.ts`; `src/inngest/lifecycle/steps/approval-handler.ts` (sibling pattern); `tests/integration/.../lifecycle-*` (must stay green).
  **Acceptance Criteria** (Tier B):
  - [ ] `wc -l src/inngest/lifecycle/steps/validate-and-submit.ts` < 200; `cleanupExecutionMachine`/`safeRecordWorkMetric` defined once; 3 path files exist; all step IDs preserved
  - [ ] `pnpm build && pnpm test -- --run && pnpm test:integration` green
  - [ ] **Tier B** full approval loop (verified in the wave's single Tier B run). Evidence: `.sisyphus/evidence/task-12-tierB-*`
        **Commit**: YES — `refactor(lifecycle): decompose validate-and-submit; dedup cleanup/metric helpers`

- [ ] 13. **Decompose `approval-handler.ts` (extract `handleReject`) + dedup `writeFeedbackEvent`**

  **What to do** (re-grep): Extract `handleReject` (≈189-508) into `src/inngest/lifecycle/steps/approval-handler-reject.ts`. Extract the duplicated `feedback_events` POST (≈242-270 and ≈607-637) into `writeFeedbackEvent(...)` in `lifecycle-helpers.ts` (shared w/ Task 12). `handleExpiry`, `handleSupersede`, `handleApprove`, and the context interface stay in the trimmed file.
  **Must NOT do**: Change approval/reject/supersede/expiry behavior, the rule-extraction firing, or Slack card update sequencing.
  **Recommended Agent Profile**: Category `ultrabrain`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 3. Parallel w/ 12,16,17,18. Blocked By: 11 (shared import surface).
  **References**: `src/inngest/lifecycle/steps/approval-handler.ts:189-508,242-270,607-637`; `tests/integration/.../approval*`.
  **Acceptance Criteria** (Tier B):
  - [ ] `handleReject` lives in its own file; `writeFeedbackEvent` defined once; `pnpm build && pnpm test -- --run && pnpm test:integration` green
  - [ ] **Tier B** rejection path exercised in the wave Tier B run. Evidence: `.sisyphus/evidence/task-13-tierB-*`
        **Commit**: YES — `refactor(lifecycle): extract handleReject and shared writeFeedbackEvent`

- [ ] 14. **Adopt `sendSuccess` — route group 1** (depends 1, 5)

  **What to do**: Using the Task-5 inventory, migrate the **SUCCESS (2xx)** `res.status().json()` calls to `sendSuccess()` in the first ~half of route files (the admin group: `admin-*` routes). Leave error responses (already `sendError`) and non-JSON redirects untouched.
  **Must NOT do**: Change response bodies/status codes; don't convert redirects/HTML; don't touch error paths.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 3. Parallel w/ 15. Blocked By: 1, 5.
  **References**: `.sisyphus/evidence/task-5-res-status-inventory.txt`; `src/gateway/lib/http-response.ts` (`sendSuccess`); `src/gateway/routes/admin-*.ts`.
  **Acceptance Criteria** (Tier A):
  - [ ] Group-1 files: 0 raw `res.status(2xx).json(`; `pnpm build && pnpm test -- --run` green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-14-tierA.txt`
        **Commit**: YES — `refactor(gateway): adopt sendSuccess in admin route group 1`

- [ ] 15. **Adopt `sendSuccess` — route group 2** (depends 1, 5)

  **What to do**: Migrate the remaining **SUCCESS (2xx)** calls (oauth/internal/webhook route group) per the Task-5 inventory. OAuth/webhook routes return redirects/HTML on success — convert ONLY JSON 2xx responses; leave redirects/HTML.
  **Must NOT do**: Convert non-JSON responses; change status codes.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 3. Parallel w/ 14. Blocked By: 1, 5.
  **References**: `.sisyphus/evidence/task-5-res-status-inventory.txt`; the oauth/internal/webhook route files.
  **Acceptance Criteria** (Tier A):
  - [ ] Combined with Task 14: `grep -rl "res\.status([0-9]*)\.json" src/gateway/routes/*.ts | grep -v ".test.ts"` returns only confirmed error/redirect paths (or empty); `pnpm test -- --run` green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-15-tierA.txt`
        **Commit**: YES — `refactor(gateway): adopt sendSuccess in oauth/internal route group 2`

- [ ] 16. **Extract gateway `override-handlers.ts` + `handleAlreadyProcessed` guard**

  **What to do** (re-grep): From `src/gateway/slack/handlers/approval-handlers.ts` (697 lines), extract `OVERRIDE_TAKE_ACTION`, `OVERRIDE_DISMISS`, `override_take_action_modal` (≈493-696) into `src/gateway/slack/handlers/override-handlers.ts` (register them from the same `index.ts` orchestrator). Extract the 3× duplicated "task no longer awaiting" guard (≈49-69,236-262,423-449) into `handleAlreadyProcessed(...)` in `shared.ts`. Preserve the singleton/registration order.
  **Must NOT do**: Change handler behavior, action IDs, ack/button-removal ordering, or the approval-flow merge (already done in a prior plan). Don't disturb `server.ts` socket-mode-lock wiring.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 3. Parallel w/ 12,13,17,18. Blocked By: none.
  **References**: `src/gateway/slack/handlers/approval-handlers.ts:49-69,236-262,423-449,493-696`; `src/gateway/slack/handlers/index.ts` (orchestrator); `src/gateway/slack/handlers/shared.ts`; `tests/**/slack/*`.
  **Acceptance Criteria** (Tier B):
  - [ ] `override-handlers.ts` exists; `approval-handlers.ts` < 500 lines; `handleAlreadyProcessed` defined once; all slack handler tests green
  - [ ] **Tier B** approval card happy-path in the wave Tier B run. Evidence: `.sisyphus/evidence/task-16-tierB-*`
        **Commit**: YES — `refactor(slack): extract override handlers and shared already-processed guard`

- [ ] 17. **Extract `opencode-harness.mts` helpers + remove dead `opencodeRunPid` branch** (+ rebuild)

  **What to do** (re-grep): Extract `markFailed`, `fireCompletionEvent`, `tryAutoPostApprovalCard`, `writeOpencodeAuth` (≈87-310) into `src/workers/lib/harness-helpers.mts`. Remove the dead `opencodeRunPid` branch — **`lsp_find_references` FIRST to confirm zero references** before deletion. Harness trims to ~700 lines. **Rebuild the Docker image** after.
  **Must NOT do**: Change output-contract semantics, provider routing, monitoring timing, or delivery/execution phase logic. No logic changes.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 3. Parallel w/ 12,13,16,18. Blocked By: none.
  **References**: `src/workers/opencode-harness.mts:87-310` (helpers); the `opencodeRunPid` branch (confirm dead via LSP); `src/workers/__tests__/opencode-harness-prompt.test.ts`; AGENTS.md "Rebuild after every worker change".
  **Acceptance Criteria** (Tier B + rebuild):
  - [ ] `harness-helpers.mts` exists; `grep -c "opencodeRunPid" src/workers/opencode-harness.mts` → 0 (LSP-confirmed dead before delete); `pnpm test -- --run tests/**/workers` green
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds; trigger `real-estate-motivation-bot-2` → `Done` + `task_metrics` row. Evidence: `.sisyphus/evidence/task-17-rebuild-run.txt`
        **Commit**: YES — `refactor(worker): extract harness helpers; remove dead opencodeRunPid branch`

- [ ] 18. **Extract `slack-input-collector.ts` + interaction-handler early-exits**

  **What to do** (re-grep): Extract `createSlackInputCollectorFunction` (≈342-489 of `slack-trigger-handler.ts`) into `src/inngest/slack-input-collector.ts` (zero shared state — clean split). Extract `interaction-handler.ts`'s pre-classification short-circuits (`detect-awaiting-input-rule`, `detect-rejection-feedback-request`, `capture-rejection-feedback`, `capture-awaiting-input-reply`, ≈70-288) into `src/inngest/lib/interaction-helpers.ts` (keep the Inngest function structure/step IDs intact). Update serve.ts registration if function exports move.
  **Must NOT do**: Change Inngest function names, step IDs, event wiring, or classification behavior.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 3. Parallel w/ 12,13,16,17. Blocked By: none.
  **References**: `src/inngest/slack-trigger-handler.ts:342-489`; `src/inngest/interaction-handler.ts:70-288`; `src/gateway/inngest/serve.ts` (registration); `tests/**/slack-input-collector*`, `tests/**/interaction*`.
  **Acceptance Criteria** (Tier A):
  - [ ] `slack-input-collector.ts` exists; `interaction-handler.ts` < 400 lines; step IDs preserved; `pnpm build && pnpm test -- --run && pnpm test:integration` green; Tier A → `Done`. Evidence: `.sisyphus/evidence/task-18-tierA.txt`
        **Commit**: YES — `refactor(inngest): extract slack-input-collector and interaction early-exits`

> **CHECKPOINT W3** — after ALL Wave-3 tasks land: `docker build` once, then ONE Tier B run covering tasks 12/13/16/17; `real-estate-motivation-bot-2` → `Done`; build/test/lint/integration green. **Wave 3 independently shippable.**

### WAVE 4 — Schema cleanup (HIGH-RISK — isolated, backed-up)

> **Confirmed DROP set (5 dead forward-compat leaves)**: `ValidationRun` (`validation_runs`), `Review` (`reviews`), `AuditLog` (table **`audit_log`** — singular, per `@@map:379`), `CrossDeptTrigger` (`cross_dept_triggers`), `Clarification` (`clarifications`). These are the schema's "9 Forward-Compatibility Tables (empty but schema-ready)" block (schema.prisma:172-175) that only the deleted `orchestrate.mts` ever wrote.
> **NOT in the drop set** (referenced by ACTIVE models): `Deliverable` (← `Execution.deliverables[]`, active), `AgentVersion` (← `Archetype.agent_version_id`, `Execution.agent_version_id`, active), `RiskModel`/`Department`/`Project`/`KnowledgeBase` (FK targets / route-referenced). Leave them; add `// forward-compat, no active writers` comments only.

- [ ] 19. **Backup DB + per-table row audit + worker-tool table-name disambiguation**

  **What to do**: (a) Back up per AGENTS.md "Database Backup (MANDATORY)" — full `pg_dump` + data-only dumps of the 5 target tables (`validation_runs`, `reviews`, `audit_log`, `cross_dept_triggers`, `clarifications`). (b) Row-audit: `SELECT count(*)` for each — capture to evidence. If any is NON-ZERO, **STOP and surface to user** (dropping data tied to the deprecated engineering employee may destroy audit history). (c) Disambiguate worker-tool grep hits: confirm `src/worker-tools/hostfully/get-reviews.ts` reads the **Hostfully API** (not the `reviews` table) and that NO `/tools/` script reads any of the 5 snake_case table names via PostgREST. (d) `lsp_find_references` on each of the 5 Prisma models + their back-relation fields to confirm no active code path.
  **Must NOT do**: Drop anything in this task (audit + backup only); don't proceed to Task 20 if any table has rows without user confirmation.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 4. Blocks: 20. Blocked By: Wave 3 complete.
  **References**: AGENTS.md "Database Backup (MANDATORY)"; `prisma/schema.prisma:117,278,292,329,347,365` (the models + `@@map`); `src/worker-tools/hostfully/get-reviews.ts` (false-positive to clear).
  **Acceptance Criteria** (Tier S):
  - [ ] Backup dir exists with full dump + 5 table dumps; row-count evidence captured for all 5 (`audit_log` not `audit_logs`)
  - [ ] LSP confirms zero active references; worker-tool disambiguation documented. Evidence: `.sisyphus/evidence/task-19-backup-audit.txt`
        **Commit**: NO (backup artifacts gitignored; audit notes committed with Task 20)

- [ ] 20. **Drop 5 dead tables via dependency-ordered migration + PostgREST verify** (depends 19)

  **What to do**: Remove the 5 models from `prisma/schema.prisma` AND every back-relation field pointing at them (`AgentVersion.reviews[]`, `AgentVersion.auditLogs[]`, `Deliverable.reviews[]`, `Execution.validationRuns[]`, `Task.crossDeptTriggers`/`auditLogs`/`clarifications` back-relations). Generate the migration via `prisma migrate dev` (NEVER hand-write). **Inspect the emitted SQL**: if it contains `DROP ... CASCADE`, a dependent was missed — STOP and fix. Drop order leaf→root so each is a plain `DROP TABLE`. Apply, then `NOTIFY pgrst, 'reload schema'` and curl-verify.
  **Must NOT do**: Hand-write the migration; drop `Deliverable`/`AgentVersion`/`Execution`; leave dangling back-relation fields (build will fail). NOTE: dropping empty forward-compat TABLES (DDL) is schema cleanup, not a soft-delete-policy violation (which governs row deletes) — note this for reviewers.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 4. Blocked By: 19 (backup + zero-row confirmation).
  **References**: `prisma/schema.prisma` (the 5 models + back-relations on `AgentVersion`/`Deliverable`/`Execution`/`Task`); AGENTS.md "PostgREST ≠ psql" + "Feature Verification Checklist"; `prisma/migrations/` (migration convention).
  **Acceptance Criteria** (Tier A + PostgREST):
  - [ ] Emitted migration SQL contains NO `CASCADE`; `prisma migrate status` up to date; `pnpm build` clean (no dangling relations)
  - [ ] After `NOTIFY pgrst,'reload schema'`: each dropped table 404s (`curl localhost:54331/rest/v1/validation_runs?limit=1` → not-found error) AND a survivor resolves (`curl .../tasks?limit=1` → `[]`). Evidence: `.sisyphus/evidence/task-20-postgrest.txt`
  - [ ] Tier A: `real-estate-motivation-bot-2` → `Done` (lifecycle unaffected). Evidence: `.sisyphus/evidence/task-20-tierA.txt`
        **Commit**: YES — `chore(db): drop 5 dead forward-compat tables (orchestrate.mts remnants)`

> **CHECKPOINT W4** — dropped tables 404 via PostgREST; surviving tables resolve; `pnpm build` clean; Tier A green; backup retained. **Wave 4 independently shippable.**

### WAVE 5 — Dashboard dedup + decomposition (EXTRACT-ONLY — Playwright parity)

> **Universal Wave-5 guardrail**: extract-only, no UI/URL-state/styling change. Prove parity with Playwright over CDP (real Chrome — `localhost:7700/dashboard/...`), NOT unit tests, NOT net-new component tests. Per decomposed page: before screenshot → extract → after screenshot, zero console errors, one named primary interaction. `pnpm dashboard:build` after every task.

- [ ] 21. **Delete dead `InputSchemaEditor.tsx` + extract `input-schema-shared.ts`**

  **What to do**: `lsp_find_references` on `dashboard/src/components/InputSchemaEditor.tsx` (360 lines) to CONFIRM zero imports (grep can miss dynamic imports), then delete it. Extract the primitives shared by the two LIVE editors (`dashboard/src/panels/employees/components/InputSchemaEditor.tsx` and `panels/employees/sections/InputSchemaSection.tsx`) — `TYPE_LABELS`, `FREQUENCY_LABELS`, `TYPE_OPTIONS`, `FREQUENCY_OPTIONS`, `KEY_REGEX`, `deriveKey`, `FormState`, `DEFAULT_FORM`, `itemToForm`, `formToItem`, `validate`, `InlineForm`, `ItemRow` — into `dashboard/src/panels/employees/components/input-schema-shared.ts(x)`. Both live files import from there; `InputSchemaSection` keeps its extra delete-dialog + `patchArchetype` save.
  **Must NOT do**: Change either live editor's rendered UI or behavior; don't merge the two live editors (they have legit differences).
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 22,23. Blocked By: none.
  **References**: the 3 editor files; `dashboard/src/panels/employees/CreateEmployeePage.tsx:8` (live import); `dashboard/src/panels/employees/EmployeeDetail.tsx` (uses InputSchemaSection).
  **Acceptance Criteria** (Tier S + Playwright + LSP):
  - [ ] `lsp_find_references` shows 0 refs before delete; `test ! -f dashboard/src/components/InputSchemaEditor.tsx`; shared primitives defined once
  - [ ] `pnpm dashboard:build` green; Playwright: open Create-Employee wizard input-schema step + Employee advanced tab → both render, 0 console errors, add-a-field interaction works. Evidence: `.sisyphus/evidence/task-21-{create,detail}.png`
        **Commit**: YES — `refactor(dashboard): delete dead InputSchemaEditor; extract shared primitives`

- [ ] 22. **Add `fireHostfullyWebhook` to `gateway.ts`; remove 3 raw-fetch copies**

  **What to do**: Add `fireHostfullyWebhook(messageUid: string): Promise<void>` to `dashboard/src/lib/gateway.ts`, then replace the 3 verbatim raw-`fetch('/webhooks/hostfully')` copies in `EmployeeDetail.tsx` (≈166), `EmployeeList.tsx` (≈240), `TriggerPanel.tsx` (≈110). In `TriggerPanel.tsx`, also import `WEBHOOK_FIXTURES` from `@/lib/constants` instead of its local redefinition.
  **Must NOT do**: Change the webhook payload shape or the endpoint; don't alter the fixtures' contents.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 21,23. Blocked By: none.
  **References**: `dashboard/src/lib/gateway.ts`; `dashboard/src/panels/employees/EmployeeDetail.tsx:166`, `EmployeeList.tsx:240`, `dashboard/src/panels/trigger/TriggerPanel.tsx:110`; `dashboard/src/lib/constants.ts` (`WEBHOOK_FIXTURES`).
  **Acceptance Criteria** (Tier S + Playwright network):
  - [ ] `grep -rc "/webhooks/hostfully" dashboard/src/panels` → 0 (all route through gateway.ts); `fireHostfullyWebhook` defined once
  - [ ] `pnpm dashboard:build` green; Playwright network capture: firing a webhook from the dashboard issues the identical request. Evidence: `.sisyphus/evidence/task-22-network.txt`
        **Commit**: YES — `refactor(dashboard): centralize fireHostfullyWebhook in gateway client`

- [ ] 23. **Extract `useSlackChannels` hook**

  **What to do**: Extract the duplicated Slack-channel fetch + loading/error pattern (`CreateEmployeePage.tsx:69-88` and `CompactSettingsGrid.tsx:92-111`) into `dashboard/src/hooks/use-slack-channels.ts` returning `{ channels, loading, error }`. Both consumers adopt it. Preserve the distinct error handling (`SLACK_NOT_CONFIGURED` vs generic).
  **Must NOT do**: Change either component's rendered behavior or the error-branch handling.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 21,22. Blocked By: none.
  **References**: `dashboard/src/panels/employees/CreateEmployeePage.tsx:69-88`; `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx:92-111`.
  **Acceptance Criteria** (Tier S + Playwright):
  - [ ] `use-slack-channels.ts` exists; both consumers import it; `pnpm dashboard:build` green
  - [ ] Playwright: both pages still render the channel dropdown with options + correct empty/error state. Evidence: `.sisyphus/evidence/task-23-{create,settings}.png`
        **Commit**: YES — `refactor(dashboard): extract useSlackChannels hook`

- [ ] 24. **Decompose `ModelCatalogPage.tsx` (910 → ~200)**

  **What to do**: Extract badge maps + `computeQualityTierLabel` → `dashboard/src/lib/model-badge-utils.ts`; form data layer (`ModelForm`, `EMPTY_FORM`, `entryToForm`, `parseOptionalFloat`, `formToPayload`) → `model-catalog-form.ts`; `FormField`/`SwitchField`/`ModelFormDialog` → `ModelFormDialog.tsx`. Page keeps data fetch + filter state + table render.
  **Must NOT do**: Change the form behavior, validation, URL-state params (`q/provider/modal/editing/removing`), or table rendering.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 25,26,27,28. Blocked By: none.
  **References**: `dashboard/src/pages/ModelCatalogPage.tsx` (line ranges in source draft); `dashboard/src/lib/utils.ts` (`computeCostTierLabel` sibling).
  **Acceptance Criteria** (Tier S + Playwright):
  - [ ] `wc -l dashboard/src/pages/ModelCatalogPage.tsx` < 300; 3 new files; `pnpm dashboard:build` green
  - [ ] Playwright: open page (data renders, 0 console errors), open the add-model dialog (form renders). Evidence: `.sisyphus/evidence/task-24-modelcatalog.png`
        **Commit**: YES — `refactor(dashboard): decompose ModelCatalogPage into form + dialog + utils`

- [ ] 25. **Decompose `EmployeeDetail.tsx` (641 → ~200)**

  **What to do**: Extract the name-edit inline input → `EmployeeNameEditor.tsx`; action button bar → `EmployeeActionBar.tsx`; advanced-tab content → `AdvancedTab.tsx` (mirrors existing `DebugTab`/`TrainingTab`); trigger dialog → `TriggerDialog.tsx`. (Webhook handler already centralized in Task 22.)
  **Must NOT do**: Change tab URL-state (`?tab=`), rendered UI, or handler behavior.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 24,26,27,28. Blocked By: none.
  **References**: `dashboard/src/panels/employees/EmployeeDetail.tsx` (line ranges in source draft); `DebugTab.tsx`/`TrainingTab.tsx` (precedent).
  **Acceptance Criteria** (Tier S + Playwright):
  - [ ] `wc -l .../EmployeeDetail.tsx` < 300; 4 new components; `pnpm dashboard:build` green
  - [ ] Playwright: open detail page, switch to advanced tab (URL updates, content renders), open trigger dialog. Evidence: `.sisyphus/evidence/task-25-employeedetail.png`
        **Commit**: YES — `refactor(dashboard): decompose EmployeeDetail into tab + dialog + bar components`

- [ ] 26. **Decompose `EmployeeList.tsx` (606 → ~200)**

  **What to do**: Extract `StatusBadge` → `dashboard/src/components/StatusBadge.tsx`; the two delete dialogs → `DeleteEmployeeDialog.tsx` + `BulkDeleteDialog.tsx`; the per-row action buttons → `EmployeeRowActions.tsx`. (Webhook handler centralized in Task 22.)
  **Must NOT do**: Change row rendering, filter URL-state (`search`/`statusFilter`), or delete/restore behavior.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 24,25,27,28. Blocked By: none.
  **References**: `dashboard/src/panels/employees/EmployeeList.tsx` (line ranges in source draft).
  **Acceptance Criteria** (Tier S + Playwright):
  - [ ] `wc -l .../EmployeeList.tsx` < 300; new components exist; `pnpm dashboard:build` green
  - [ ] Playwright: list renders rows, apply a status filter (URL updates), open a delete dialog. Evidence: `.sisyphus/evidence/task-26-employeelist.png`
        **Commit**: YES — `refactor(dashboard): decompose EmployeeList into row-actions + dialogs + badge`

- [ ] 27. **Decompose `CreateEmployeePage.tsx` (612 → ~200)**

  **What to do**: Extract the large `edit` step JSX (≈292-562) → `WizardEditStep.tsx`; the 3 data-fetching effects + their state → `dashboard/src/hooks/use-wizard-data.ts`. Small steps (describe/preview) may stay inline. (Adopt `useSlackChannels` from Task 23 where applicable.)
  **Must NOT do**: Change wizard step flow, generated-field editing, or `?repo=` URL-state.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 24,25,26,28. Blocked By: none.
  **References**: `dashboard/src/panels/employees/CreateEmployeePage.tsx` (line ranges in source draft); Task 23 `useSlackChannels`.
  **Acceptance Criteria** (Tier S + Playwright):
  - [ ] `wc -l .../CreateEmployeePage.tsx` < 300; `WizardEditStep.tsx` + `use-wizard-data.ts` exist; `pnpm dashboard:build` green
  - [ ] Playwright: open the wizard, reach the edit step, 0 console errors. Evidence: `.sisyphus/evidence/task-27-wizard.png`
        **Commit**: YES — `refactor(dashboard): decompose CreateEmployeePage edit step + wizard data hook`

- [ ] 28. **Decompose `CompactSettingsGrid.tsx` (reducer + hook)**

  **What to do**: Extract `FormState`/`FormAction`/`initForm`/`formReducer` → `compact-settings-form.ts` (co-located); adopt the `useSlackChannels` hook (Task 23). Component keeps render + save/cancel handlers.
  **Must NOT do**: Change the settings fields, edit/view toggle, or save behavior.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 24,25,26,27. Blocked By: 23 (uses the hook).
  **References**: `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx`; Task 23 hook.
  **Acceptance Criteria** (Tier S + Playwright):
  - [ ] `compact-settings-form.ts` exists; component uses `useSlackChannels`; `pnpm dashboard:build` green
  - [ ] Playwright: open settings, toggle a field to edit, save path renders. Evidence: `.sisyphus/evidence/task-28-settings.png`
        **Commit**: YES — `refactor(dashboard): extract CompactSettingsGrid reducer; adopt useSlackChannels`

> **CHECKPOINT W5** — `pnpm dashboard:build` green; all 5 decomposed pages pass Playwright parity (render + 0 console errors + one interaction); no page > ~300 lines. **Wave 5 independently shippable.**

### WAVE 6 — Conventions, docs & final wave (ship last)

- [ ] 29. **Name the magic numbers (no value changes)**

  **What to do**: Extract hardcoded literals into named `const`s with explanatory comments — VALUE-IDENTICAL: `src/inngest/lifecycle/steps/execute.ts` (`kill_timeout: 1800`, `maxPolls: 120`, `intervalMs: 15_000` → e.g. `EXECUTION_KILL_TIMEOUT_S`, `MAX_EXECUTION_POLLS`, `POLL_INTERVAL_MS` with a comment: `120 × 15s = 30min max execution`); `src/workers/lib/opencode-server.ts` (port `4096`, healthTimeout `30000`, idle `300000`, reconnect `50/100`, force-kill `5000`); `src/workers/lib/session-manager.ts` (`10_000`, `60*60*1000`, `30_000`, `4000`); `src/inngest/lifecycle/steps/validate-and-submit.ts` (`setTimeout(...,1000)` ×2).
  **Must NOT do**: Change ANY numeric value (Metis trap — naming only, not tuning); don't relocate the constants into config.ts.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 6. Parallel w/ 30,31,32. Blocked By: 12,17 (those files change in W3 — do 29 after).
  **References**: `src/inngest/lifecycle/steps/execute.ts:299,308,309`; `src/workers/lib/opencode-server.ts:26,28,42,85,90,117,122,230`; `src/workers/lib/session-manager.ts:250,317,318,354`.
  **Acceptance Criteria** (Tier S):
  - [ ] Named constants present with comments; `git diff` shows ONLY literal→named substitution, zero value change; `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `refactor: name magic numbers in lifecycle/worker timeouts (no value change)`

- [ ] 30. **Document barrel-file policy + catch-handler + `as unknown as` exceptions**

  **What to do**: Add to CONTRIBUTING.md: (a) **Barrel-file policy** — "We do NOT use `index.ts` barrels except the 3 existing intentional ones (`slack/handlers`, `enrichment-adapters`, `model-selection`); import modules directly. Do not add new barrels." (b) **Intentional swallowed catches** — explain that Slack/Bolt action handlers MUST NOT throw (Bolt swallows + breaks the socket), so their `catch` blocks log-and-return by design; reference `socket-mode-lock.ts`'s intentional bare catches. (c) **`as unknown as` policy** — list the legitimate uses (Bolt ack types, Prisma `InputJsonValue`, Node `dirent` compat) and instruct to prefer fixing the type, using `as unknown as` only at documented external-boundary points. **DOCUMENT ONLY — change zero code.**
  **Must NOT do**: Change any catch handler or cast (Metis: document-only); don't add new barrels.
  **Recommended Agent Profile**: Category `writing`; Skills: [].
  **Parallelization**: Wave 6. Parallel w/ 29,31,32. Blocked By: none.
  **References**: `CONTRIBUTING.md`; `src/gateway/slack/handlers/approval-handlers.ts` (log-only catches); `src/gateway/lib/socket-mode-lock.ts:56,66,133` (intentional bare catches).
  **Acceptance Criteria** (Tier S):
  - [ ] CONTRIBUTING.md has "Barrel Files", "Swallowed Errors in Bolt Handlers", "Type Assertions (`as unknown as`)" sections; zero code changed
        **Commit**: YES — `docs(contributing): document barrel, catch-handler, and type-assertion conventions`

- [ ] 31. **Fix AGENTS.md `sendSuccess` doc rot + document `knowledge_base` naming exception**

  **What to do**: AGENTS.md currently claims `sendSuccess()` is "paired with `sendError()`" — now TRUE after Task 1, so update the wording to reflect that `sendSuccess` exists and is used for 2xx (point to `http-response.ts`). Also add a one-line note (AGENTS.md + CONTRIBUTING) that `src/worker-tools/knowledge_base/` uses snake_case INTENTIONALLY to match the Docker `/tools/knowledge_base/` path (the lone exception to kebab-case tool dirs).
  **Must NOT do**: Rename the `knowledge_base` directory (it must match the Docker path); don't restate the whole http-response convention.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 6. Parallel w/ 29,30,32. Blocked By: 1 (sendSuccess must exist).
  **References**: AGENTS.md "`sendError()` for ALL route error responses" + the `sendSuccess` mention; `src/worker-tools/knowledge_base/`; CONTRIBUTING.md.
  **Acceptance Criteria** (Tier S):
  - [ ] AGENTS.md `sendSuccess` wording matches reality; `knowledge_base` snake_case exception documented in both files
        **Commit**: YES — `docs: correct sendSuccess reference; document knowledge_base naming exception`

- [ ] 32. **Update AGENTS.md / README / CONTRIBUTING for new modules + dropped tables + relocated repos**

  **What to do**: Per Documentation Freshness — document: new `sendSuccess` + extended `createHttpClient`; the relocated tenant repositories (new path); `harness-helpers.mts`, `lifecycle-helpers.ts`, the new lifecycle path files, `override-handlers.ts`, `slack-input-collector.ts`, `interaction-helpers.ts`; dashboard `input-schema-shared.ts`, `useSlackChannels`, `use-wizard-data`, `fireHostfullyWebhook`. Remove the 5 dropped models from any AGENTS.md schema references. Update the "Project Structure" notes where module homes changed.
  **Must NOT do**: Duplicate CONTRIBUTING into AGENTS (link); don't add employee-specific content to shared docs.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 6. Parallel w/ 29,30,31. Blocked By: Waves 1-5 complete.
  **References**: `AGENTS.md`, `README.md`, `CONTRIBUTING.md`; all new/moved files from this plan.
  **Acceptance Criteria** (Tier S):
  - [ ] Docs reference the new/moved modules; no stale reference to the 5 dropped tables; `grep -c "sendSuccess\|harness-helpers\|override-handlers" AGENTS.md` ≥ 1
        **Commit**: YES — `docs: update AGENTS/README/CONTRIBUTING for third maintainability pass`

- [ ] 33. **Final Verification Wave + docs freshness + git cleanup + Telegram notify**

  **What to do**: Run the Final Verification Wave (F1-F4 below), present consolidated results, get explicit user okay. Confirm Documentation Freshness done (Task 32). Run Git Cleanup (`git status --short` must be clean — commit stray plan/notepad files, delete temp files). **Send Telegram completion notification** (`pnpm exec tsx scripts/telegram-notify.ts "✅ Third maintainability pass complete — all tasks done, baseline green. Come back to review."`).
  **Must NOT do**: Mark F1-F4 checked before the user's explicit okay.
  **Recommended Agent Profile**: Category `deep`; Skills: [`e2e-testing`, `debugging-lifecycle`].
  **Parallelization**: LAST. Blocked By: all (1-32).
  **References**: AGENTS.md "Documentation Freshness" + "Git Cleanup on Plan Completion" + "Telegram Notifications"; `scripts/telegram-notify.ts`.
  **Acceptance Criteria** (Tier B — full):
  - [ ] F1-F4 all APPROVE; user gives explicit okay
  - [ ] `git status --short` clean; Telegram completion sent (exit 0). Evidence: `.sisyphus/evidence/final-qa/`
        **Commit**: YES — `docs: finalize third maintainability pass`

> **CHECKPOINT W6** — full E2E green; docs current; F1-F4 APPROVE + user okay; git clean. **Plan complete.**

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user; get explicit "okay" before completing. Never mark F1-F4 checked before the user's okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists (read file, curl endpoint, run command). For each "Must NOT Have": search for forbidden patterns — reject with file:line if found (server.ts startup reads still raw? response shape changed? new barrels added? catch handlers behavior-changed? AgentVersion/Deliverable dropped?). Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run` + `pnpm test:integration` + `pnpm dashboard:build`. Review changed files for `as any`/new `@ts-ignore`, empty catches introduced, console.\* in prod, commented-out code, unused imports, AI slop. Confirm no decomposed file regressed.
      Output: `Build [P/F] | Lint [P/F] | Unit [N/N] | Integration [N/N] | Dashboard [P/F] | VERDICT`

- [ ] F3. **Real Manual QA — Tier A + Tier B + Dashboard parity** — `unspecified-high` (+ `e2e-testing`, `playwright` skills)
      Tier A: `real-estate-motivation-bot-2` → `Done` + metrics (psql AND PostgREST) + Slack. Tier B: full approval loop → delivery. Dashboard: load all 5 decomposed pages, zero console errors, one interaction each. Schema: dropped tables 404 via PostgREST, survivors resolve. Evidence → `.sisyphus/evidence/final-qa/`.
      Output: `Tier A [P/F] | Tier B [P/F] | Dashboard [N/N pages] | Schema [P/F] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything in spec built, nothing beyond spec (no behavior change in extractions, no shape change in sendSuccess, no value change in named magic numbers, no catch-handler behavior edits). Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

- One commit per task (conventional commits: `feat`, `refactor`, `chore`, `perf`, `docs`).
- Pre-commit: `pnpm build && pnpm test -- --run && pnpm lint` (+ `pnpm dashboard:build` for dashboard). Never `--no-verify`.
- No AI / Co-authored-by trailers.
- Wave themes: W1 helpers · W2 foundation adoption · W3 backend decomp · W4 schema cleanup · W5 dashboard · W6 docs.

## Success Criteria

### Verification Commands

```bash
pnpm build && pnpm lint && pnpm test -- --run && pnpm test:integration && pnpm dashboard:build   # all green
grep -rl "res\.status([0-9]*)\.json" src/gateway/routes/*.ts | grep -v ".test.ts"                # only error paths (or empty)
grep -c "function sendSuccess" src/gateway/lib/http-response.ts                                   # 1
grep -rln "gateway/services" src/inngest --include="*.ts" | grep -v node_modules                  # empty (repos relocated)
test ! -f dashboard/src/components/InputSchemaEditor.tsx                                           # deleted
```

### Final Checklist

- [ ] All "Must Have" present; all "Must NOT Have" absent
- [ ] `sendSuccess` authored + adopted; `createHttpClient` extended + adopted
- [ ] 8 Hostfully tools + 4 OAuth routes + shared.ts migrated; tenant repos relocated
- [ ] Backend large files decomposed (extract-only); harness rebuilt + Tier B green
- [ ] 5 dead tables dropped; PostgREST verified
- [ ] Dashboard deduped + decomposed; Playwright parity per page
- [ ] Conventions documented; AGENTS.md/README/CONTRIBUTING updated; F1-F4 APPROVE + user okay
