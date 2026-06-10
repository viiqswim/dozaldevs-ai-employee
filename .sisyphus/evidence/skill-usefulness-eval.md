# Skill Usefulness Evaluation

Honest before/after evaluation of 10 new OpenCode dev skills for the `ai-employee` repo.
Question being answered: **do these skills actually change agent behavior, or are they passing
greps while adding noise?**

## Methodology

For three representative tasks I wrote two answers each:

- **(A) Baseline** — what a capable model produces from `AGENTS.md` alone (no skill loaded).
  I ground-truthed every "AGENTS.md covers X" claim by grepping `AGENTS.md` directly rather than
  trusting the task framing.
- **(B) With Skill** — the delta the skill adds, with specific rules/facts quoted from the skill
  file.

Then a verdict: **STRONG** (skill prevents a real mistake or surfaces non-obvious repo knowledge),
**MARGINAL** (skill mostly restates what the baseline already knew), or **CUT** (noise / no delta).

After the three micro-tasks, a reasoned verdict for all 10 skills — including the five not directly
exercised (security, feature-verification, production-ops, slack-conventions, long-running-commands).

**Ground-truth corrections to the task framing (honesty first):**

1. The framing claims "the step modules (`lifecycle/steps/`) are NOT listed in AGENTS.md." **False.**
   `AGENTS.md` line 334 lists all 11 step modules in the Project Structure tree, including
   `lifecycle-helpers.ts` and its `cleanupExecutionMachine` / `safeRecordWorkMetric` exports. The
   baseline is therefore *not* blind to file locations. This materially raises the baseline bar for
   Micro-Task 1, and I score it accordingly.
2. `mergeTaskMetadata` and `NonRetriableError` appear in `AGENTS.md` **only** in the skill-table row
   that advertises the `inngest` skill (line 147) — never as actionable guidance. So the baseline
   does *not* know to use them. That is a genuine skill delta.
3. AGENTS.md already states the `react-dashboard` headline rules (SearchableSelect, card shell
   classes, `useSearchParams`) almost verbatim in Key Conventions. That materially *lowers* the
   skill's delta for Micro-Task 3.

---

## Micro-Task 1: Inngest Lifecycle Step

> "Describe how you would add a new step to the employee lifecycle that posts a metric after the
> Delivering state completes."

### Baseline (AGENTS.md only)

AGENTS.md gives a surprisingly strong start here:

- **Lifecycle states** are listed: `… Delivering → Done` — so the model knows where "after
  Delivering" sits.
- **Deprecated Components** table explicitly flags `src/inngest/lifecycle.ts` and `redispatch.ts` as
  the engineering monolith — "do NOT modify… unless explicitly instructed." So a careful baseline
  model **would avoid editing the deprecated monolith** and target `employee-lifecycle.ts`.
- **Project Structure** (line 334) lists the `lifecycle/steps/` directory and every module by name,
  including `delivery-retry.ts` (Delivering), `notify-and-track.ts`, and `lifecycle-helpers.ts`
  (`cleanupExecutionMachine`, `safeRecordWorkMetric`). So the baseline can locate the delivery step
  module and even discover that a work-metric helper already exists.

What the baseline would likely get **wrong or miss**:

- It would probably add logic by editing `employee-lifecycle.ts` directly (it has no signal that the
  file is a thin 84-line orchestrator that must stay logic-free).
- It would hand-roll a `fetch`-then-PATCH against the task `metadata` column.
- It would type the handler with `GetStepTools<Inngest>` inline.
- It might throw a plain `Error` on an unrecoverable failure, triggering pointless Inngest retries.
- It would not know the no-nesting-steps replay rule.

### With `inngest` Skill

The skill closes exactly those gaps with named, quotable rules:

- **"`employee-lifecycle.ts` is a thin orchestrator (84 lines)… NEVER add lifecycle logic directly
  to `employee-lifecycle.ts`. Find the matching step module and add it there."** Plus a phase→module
  map: Delivering → `delivery-retry.ts`; shared helpers → `lifecycle-helpers.ts`
  (`safeRecordWorkMetric`, `mergeTaskMetadata`, `writeFeedbackEvent`).
- **`InngestStep`**: "ALWAYS use this, never inline `GetStepTools<Inngest>`" — `import type
  { InngestStep } from '../events.js'`.
- **`mergeTaskMetadata`**: "Never fetch-then-patch the `metadata` column inline. Use this helper."
  For "post a metric" this is the exact correct primitive — and the baseline had no signal to use it.
- **`makePostgrestHeaders`**: "Every PostgREST request… MUST use this. Never construct headers
  inline."
- **`NonRetriableError`** for permanent failures vs plain `Error` for retryable ones.
- **No-nesting + idempotency**: "Inngest replays steps on retry. Every `step.run()` callback must be
  safe to re-run" — directly relevant to a metric write (use the idempotent `safeRecordWorkMetric`,
  not a naive insert).

### Delta & Verdict

The skill does **not** win on file discovery — AGENTS.md already lists the step modules and even
names `safeRecordWorkMetric`. The skill wins decisively on **anti-pattern prevention**: the
"never touch the thin orchestrator," "use `mergeTaskMetadata` not inline fetch-patch," "`InngestStep`
not `GetStepTools` inline," and `NonRetriableError` rules are all real, non-obvious, and absent from
AGENTS.md's actionable body (they appear only as a one-line advertisement on line 147). A baseline
model would produce working-but-wrong-shaped code that fails review on at least three conventions.

**Verdict: STRONG** — caveat: AGENTS.md gives a ~60% head start on *where* to put the code; the
skill's value is *how* to write it correctly.

---

## Micro-Task 2: New Admin Endpoint + Table

> "Describe how you would add a new admin endpoint `GET /admin/tenants/:tenantId/widgets` backed by a
> new `widgets` table."

### Baseline (AGENTS.md only)

AGENTS.md Key Conventions cover several pieces well:

- **`sendError`/`sendSuccess`**: "Every gateway route handler MUST use `sendError()`… and
  `sendSuccess()`… never inline `res.status(N).json()`." (Strong, verbatim.)
- **`UUID_REGEX`**: the Zod v4 quirk and the instruction to use the loose regex for tenant/task UUIDs
  is in Key Conventions. (Strong.)
- **Multi-tenancy** + **soft-delete** mandates are in Key Conventions — so the baseline scopes by
  `tenant_id` and filters `deleted_at`.
- **Repository layer** and **`makePostgrestHeaders`** get a one-line mention each in Project
  Structure.

What the baseline would **miss** — and these are the expensive ones:

- **PostgREST schema-cache reload after migration.** Nothing in AGENTS.md's body warns that a new
  table is invisible to PostgREST until `NOTIFY pgrst, 'reload schema'` runs. The migration "works"
  in `psql`, the route returns data via Prisma, and then **every worker write to the table fails with
  `PGRST205`** — a silent, downstream, hard-to-trace failure.
- The **repository mandate** ("NEVER raw `prisma.model.x()` inline in a route") — AGENTS.md only
  *names* the repositories; it never states the rule. Baseline would inline Prisma in the handler.
- **`ERROR_CODES` enum requirement** and **`isPrismaError(err)` not `err instanceof
  PrismaClientKnownRequestError`** — absent from AGENTS.md.
- **Status-code conventions** (202 + `{ task_id, status_url }`, 409 on P2002) — absent.
- **`deleted_at` coverage gap**: blindly adding `deleted_at: null` to a table that lacks the column
  throws at runtime. AGENTS.md doesn't track which tables have it.

### With `api-design` + `prisma` + `data-access-conventions` Skills

- **`prisma` skill** carries the single most valuable fact: the **PGRST205 schema-cache reload**, the
  exact `NOTIFY pgrst, 'reload schema'` command, and the **PostgREST-vs-psql verification curl**.
  Also: use `DATABASE_URL_DIRECT` (5432) for migrations not the pooler; the per-table `deleted_at`
  gap ("[ARCH-10]… `PendingApproval`, `EmployeeRule`, `FeedbackEvent`, `TaskMetric` still lack it —
  check the schema before adding a `deleted_at: null` filter"); update `postgrest-types.ts` if
  workers need the table.
- **`api-design` skill** is the canonical home for the **admin endpoint catalog** and the handler
  contract: `uuidField()` not `z.string().uuid()` (with the precise reason), the `sendError`/
  `sendSuccess` signatures, `ERROR_CODES`, `isPrismaError` + P2002→409, the full status-code table,
  and a copy-paste canonical handler. It turns "I know the helpers exist" into "I can write the
  handler correctly on the first try."
- **`data-access-conventions` skill** states the repository mandate explicitly ("NEVER write raw
  `prisma.model.findFirst()` inline… that logic belongs in a repository"), the `config.ts` env-access
  rule, `makePostgrestHeaders`, `createHttpClient`, and the worker-vs-repository boundary.

### Delta & Verdict

The PostgREST cache-reload fact alone justifies the `prisma` skill — it converts a silent
production-class failure into a one-line command the model runs reflexively. `api-design` adds real
correctness scaffolding (ERROR_CODES, isPrismaError, status codes, handler pattern) on top of the
two things AGENTS.md already covers (sendError/UUID). `data-access-conventions` adds the explicit
repository mandate AGENTS.md only implies.

Honest caveat: loading all three **together** triple-states some rules — the repository mandate
appears in all three, and `makePostgrestHeaders` in two. There's real overlap.

**Verdict: STRONG** for `prisma` and `api-design`; the trio as a bundle is STRONG but redundant — see
`data-access-conventions` per-skill note.

---

## Micro-Task 3: Dashboard Filter Dropdown

> "Describe how you would add a status filter dropdown to the tasks page."

### Baseline (AGENTS.md only)

This is the case where the baseline is **already nearly complete**, because AGENTS.md Key Conventions
duplicate the headline rules almost verbatim:

- **SearchableSelect**: "Any dropdown/select… MUST use `<SearchableSelect>` from
  `dashboard/src/components/ui/searchable-select.tsx` instead of the Radix UI `<Select>`… Never use
  `<Select>` from `@/components/ui/select`." Even the prop list is in AGENTS.md.
- **URL-encoded state**: "Every tab, filter… MUST reflect its state in the URL… Use `useSearchParams`
  … copy current `URLSearchParams` and set only the changed key." A status filter is the literal
  example given (`?status=done`).
- **Card shell**: the exact classes `rounded-lg border bg-card` + `px-5 py-4` and `CollapsibleSection`
  are both in AGENTS.md Key Conventions.

So a baseline model already picks `SearchableSelect`, already encodes the filter in `?status=`, and
already wraps the section in a card. The big mistakes are pre-empted by AGENTS.md, not the skill.

### With `react-dashboard` Skill

The skill's genuine, non-duplicated deltas are narrow but real:

- **The clobber trap**, stated as a named anti-pattern: `setSearchParams({ status: next })` "WRONG —
  wipes `?tenant=` and every other existing param"; correct form is the functional updater
  `setSearchParams((prev) => { prev.set('status', next); return prev; }, { replace: true })`. This
  *is* non-obvious and *is* a live bug — AGENTS.md says "preserve existing params" but doesn't show
  the exact failure mode or the `{ replace: true }` history-pollution nuance.
- **Live traps / audit IDs**: Radix `<Select>` still wrongly used in `Header.tsx`/`InputSchemaEditor`
  (DASH-2), Sidebar still labels the org list "Tenants." Concrete fix-on-sight pointers.
- Canonical reference files (`Layout.tsx` `TenantUrlSync`, `Header.tsx` org switcher).

Everything else in the skill (the SearchableSelect mandate, the card-shell classes, the
non-technical-copy table) **restates AGENTS.md at length**.

### Delta & Verdict

For this specific task the skill's net new value is: the `prev.set()` vs `setSearchParams({})`
clobber trap, the `{ replace: true }` nuance, and the named live traps. That's worth something — the
clobber bug is real — but ~70% of the skill is a longer re-statement of conventions already injected
into every turn via AGENTS.md.

**Verdict: MARGINAL** — keep the non-obvious deltas (clobber trap, `CollapsibleSection` path, live
traps), trim the sections that re-derive AGENTS.md. As written it's mostly validation theater layered
on top of already-present baseline knowledge.

---

## Per-Skill Verdict Table

| Skill | Verdict | Rationale |
|-------|---------|-----------|
| `prisma` | **STRONG** | The PostgREST schema-cache reload (`PGRST205`) and the psql-≠-PostgREST verification curl are non-obvious, repo-specific, and prevent a silent worker-write failure. Plus `DATABASE_URL_DIRECT` for migrations, the `TaskRepository`-is-read-only rule, and the per-table `deleted_at` gap. None of this is in the AGENTS.md body. |
| `inngest` | **STRONG** | Anti-pattern prevention a baseline gets wrong: "never add logic to the thin `employee-lifecycle.ts`," `mergeTaskMetadata` over inline fetch-patch, `InngestStep` over inline `GetStepTools`, `NonRetriableError`, no-nesting/idempotency. Caveat: AGENTS.md already lists the step files, so file *discovery* isn't the win — convention *correctness* is. |
| `api-design` | **STRONG** | Canonical home for the admin endpoint catalog (moved out of AGENTS.md) plus the handler contract: `ERROR_CODES`, `isPrismaError`→P2002, status-code table, copy-paste handler. Overlaps AGENTS.md on `sendError`/`UUID_REGEX`, but the additive correctness scaffolding is substantial. |
| `react-dashboard` | **MARGINAL** | AGENTS.md Key Conventions already state all three headline rules (SearchableSelect, card shell, `useSearchParams`) nearly verbatim. The skill's real delta is the `setSearchParams({})` clobber trap, the `{ replace: true }` nuance, and named live traps (DASH-2, Sidebar "Tenants"). Recommend trimming to those deltas; the rest is re-statement. |
| `security` | **STRONG** | Concrete, non-obvious, and *good-citizen*: AES-256-GCM specifics, `ENCRYPTION_KEY` 64-hex fail-fast, the `VLRE_SLACK_BOT_TOKEN` seed-only rule, `timingSafeEqual` admin auth, no-PII-in-logs. It correctly *defers* soft-delete/multi-tenancy to AGENTS.md instead of duplicating them — exactly the discipline `react-dashboard` lacks. |
| `data-access-conventions` | **MARGINAL** | Genuinely useful as a single 7-rule index, and it carries some unique content (`config.ts` named getters, `createHttpClient`, the worker-vs-repository boundary diagram). But it overlaps `prisma` (repository rule), `api-design` (sendError/ERROR_CODES), and `inngest` (`makePostgrestHeaders`, `mergeTaskMetadata`, `InngestStep`) — load all four and several rules are triple-stated. Its trigger ("any code that reads/writes the DB, env vars, or makes outbound HTTP") is also very broad → noise risk. Recommend: keep as the canonical index, trim per-rule detail to a pointer + the unique rules (config.ts, http-client, boundary), and narrow the trigger. |
| `feature-verification` | **STRONG** | PostgREST-≠-psql, zero-rows-is-failure, and the `real-estate-motivation-bot-2` smoke employee with exact archetype ID + curl are concrete and repo-specific. AGENTS.md deliberately moved its "Feature Verification Checklist (MANDATORY)" into this skill — it's the canonical home, not a duplicate. |
| `production-ops` | **STRONG** | Pure non-obvious operational facts with a narrow trigger: Render service ID, `PUT /env-vars` replaces ALL vars, `dockerfilePath` must nest under `envSpecificDetails`, `?limit=100` pagination, prod `DATABASE_URL` needs `?pgbouncer=true`. Each one is a multi-hour debugging session avoided. Model has no other way to know these. |
| `slack-conventions` | **STRONG** | "Socket Mode — NEVER configure an Interactivity URL," the mandatory task-ID context block, and especially the known-issues (dev/prod shared `SLACK_APP_TOKEN` round-robin event drop; phantom sockets) are non-obvious and directly tied to flaky-test root causes. Narrow trigger. AGENTS.md explicitly delegates all Slack detail here. |
| `long-running-commands` | **CUT** | The tmux launch+poll pattern, the 5 cleanup rules, session naming, and the macOS vnode-exhaustion note are **already duplicated nearly verbatim in the always-loaded global `~/.config/opencode/AGENTS.md`** ("Long-Running Commands" + "Tmux Session Cleanup (MANDATORY)"). For this operator the project skill adds an extra discoverable entry with zero novel content. Cut it from the project skill set (or keep only as a thin pointer to the global rule). This is the one skill that is purely passing greps while adding noise. |

---

## Recommendations

1. **Cut `long-running-commands` from the project skill set.** It is verbatim-redundant with the
   always-on global `AGENTS.md`. A skill earns its slot only by adding knowledge that isn't already
   in always-loaded context; this one doesn't. (If kept, reduce it to a 3-line pointer.)

2. **Trim `react-dashboard` to its deltas.** ~70% re-states AGENTS.md Key Conventions. Keep: the
   `setSearchParams({})` clobber trap + `{ replace: true }` nuance, the `CollapsibleSection` path,
   and the named live traps (DASH-2, Sidebar "Tenants"). Drop the sections that re-derive
   SearchableSelect / card-shell / non-technical-copy rules already injected every turn.

3. **De-duplicate the data-access trio.** `data-access-conventions`, `prisma`, `api-design`, and
   `inngest` triple-state the repository mandate and double-state `makePostgrestHeaders`. Make
   `data-access-conventions` the canonical index that *points* to the others for detail, and narrow
   its very broad trigger so it doesn't load on every gateway edit. Verdict stands at MARGINAL until
   then.

4. **Keep, unchanged, the six high-signal skills:** `prisma`, `inngest`, `api-design`, `security`,
   `feature-verification`, `production-ops`, `slack-conventions` — each surfaces non-obvious,
   repo-specific knowledge a capable model would otherwise get wrong, with appropriately narrow
   triggers. (`security` and `feature-verification` are model citizens: they defer to AGENTS.md for
   shared mandates instead of duplicating them.)

**Scorecard: 7 STRONG · 2 MARGINAL · 1 CUT.** The skill set is mostly real signal. The two failure
modes to watch are (a) skills that re-state AGENTS.md Key Conventions at length (`react-dashboard`),
and (b) redundancy across the four data-access skills. One skill (`long-running-commands`) is pure
noise *for this environment* because its content already lives in always-loaded global context.
