# Fix Production Invitation-Acceptance Bug (vanilla: single source of user creation)

## TL;DR

> **Quick Summary**: A user (`olivia@vlrealestate.co`) accepted an invitation, hit an error, and landed on a data-less dashboard. Two design flaws conspire: (1) **two code paths create user rows keyed two different ways** — `ensureUserExists` (by Supabase auth-ID, on every authenticated request) and the public `/invitations/accept` transaction (by email) — and (2) **the elected single writer, `ensureUserExists`, is not concurrency-safe**, so two parallel first-login requests can both insert and one 401s. We make `ensureUserExists` the **single, concurrency-safe** creator (catch the unique-violation + re-fetch) AND make `/invitations/accept` **authenticated and membership-only** (removing the second writer). Only both together make the "single creator" invariant true under load.
>
> **Deliverables**:
>
> - A read-only diagnostic of Olivia's actual production records to confirm the real failure mode before any fix
> - **Concurrency-safe `ensureUserExists`**: a concurrent first-touch by the same new user converges on one row; neither request 401s (catch P2002 + re-fetch — the load-bearing fix)
> - `/invitations/accept` requires authentication and only creates/restores a membership for the already-existing user (`req.auth.id`) — no inline user creation, no email lookup, no null-auth-ID row possible
> - Frontend passes the freshly-minted session token explicitly to the accept call (closes the async-token-storage timing gap)
> - A proportionate one-off recovery for Olivia (and any other affected row), sized for a near-empty app — not a productionized fleet tool
> - RED→GREEN Vitest coverage (including a **concurrent first-login** test) and a local Docker E2E proving a fresh invitee reaches a data-populated dashboard
> - Corrected `email-setup.md` documentation
> - A recorded decision rejecting the single-atomic "complete-invite" endpoint, with the trigger conditions that would reopen it
>
> **Estimated Effort**: Short–Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (diagnose) → Task 1b (concurrency-safe ensureUserExists) → Task 2 (RED) → Task 3 (vanilla accept) → Task 4 (frontend token) → Task 5 (E2E) → Final Verification → user okay

---

## Context

### Original Request

`olivia@vlrealestate.co` was invited in production. After she set her password / confirmed it, an error prevented her account from being fully created. She landed on the dashboard with **no data**. The user wants a permanent fix so no one hits this or a similar issue, and asked to be told about any other bugs found.

### Interview Summary — including a critical-thinking revision

The first draft of this plan proposed a _defensive_ fix (heal-on-login + a hardened scan script). On review, the user challenged three things, all correctly:

1. **The assumed trigger (timeout/rate-limit) is implausible on a ~2-user app.** The more likely trigger is a **self-race inside one user's own accept flow**: `signInWithPassword` fires `onAuthStateChange` → `getMe()` → `ensureUserExists` (creates a user row by auth-ID) at the same time the `acceptInvitation` transaction tries to create a user row by email. Two inserts, one unique email column → one loses with a constraint violation. This needs zero load. **It also means heal-on-login might not even have fixed Olivia** (if her user row got the correct auth-ID and only the membership was lost) — which is why we diagnose before fixing.
2. **The scan script was over-engineered for the scale.** At ~2 users, a diagnostic read plus a manual correction is proportionate; a dry-run-gated, flag-protected, unit-tested fleet tool is gold-plating. Dropped.
3. **The defensive complexity was a symptom, not a cure.** Heal-on-login, a takeover guard, and email-fallback reconciliation are only necessary _because_ user rows are created in two places. The vanilla fix removes the second creator instead of papering over the collision. **Near-zero users is the argument _for_ the clean rewrite now** — there is nothing to protect and no cheaper moment.

**Confirmed decisions**:

- **Diagnose first**: read Olivia's real records (read-only) before committing to a fix.
- **Vanilla architecture**: single source of user creation. `/invitations/accept` becomes authenticated and membership-only.
- E2E verification: **local Docker only** (production recovery for Olivia is a separate, explicit, backup-first step).
- Test strategy: **TDD (RED→GREEN)**. Vitest (`pnpm test:unit`, `pnpm test:integration`).
- Soft-delete only; no hard deletes anywhere.

### Research Findings (code-verified)

- **Dual-write/dual-key is the disease**: `ensureUserExists` (`src/gateway/services/ensure-user-exists.ts`) upserts a user row keyed on `supabase_id` on every authenticated request. The public `/invitations/accept` route (`src/gateway/routes/admin-invitations.ts:285-403`) _also_ creates a user row inside a Serializable transaction, keyed by email lookup, and can persist `supabase_id: null` (line 342) when its inline `getSupabaseUserIdByEmail` returns null.
- **`users.email` is `@unique`** (`prisma/schema.prisma:538`). Two concurrent inserts for the same email collide (P2002).
- **`authMiddleware` already calls `ensureUserExists`** (`src/gateway/middleware/auth.ts:43`) and sets `req.auth`. So if accept required auth, the user row would already exist (created by auth-ID) before the handler body runs — `req.auth.id` is available, and the inline create is unnecessary. The middleware swallows errors and returns **401 INVALID_TOKEN** (line 52-54), which is why the incident looked like a generic auth failure.
- **`ensureUserExists` is NOT concurrency-safe (the real load-bearing gap)**: it is a plain `prisma.user.upsert` keyed on `supabase_id` (`src/gateway/services/ensure-user-exists.ts:7`) with **no unique-violation handling**. On a brand-new user's first sign-in, `onAuthStateChange` fires **two parallel requests** — the auth context calls `/me` and the tenant provider calls `/me/tenants` (`dashboard/src/contexts/AuthContext.tsx` + `dashboard/src/hooks/use-tenant.ts`) — and BOTH run `authMiddleware → ensureUserExists` for a row that does not exist yet. Two concurrent inserts on the `email` (or `supabase_id`) unique column → one wins, the **other throws P2002 → `authMiddleware` turns it into a 401**. This race (a) exists **today, independent of invitations**, (b) is a more plausible explanation for Olivia's "blank, then fine on reload" than the accept-vs-accept race (on reload the row already exists, so both calls succeed — which matches the verified production state where her data was fully consistent), and (c) gets **worse with scale** (more new users → more concurrent-first-touch collisions). Making accept authenticated routes a _third_ concurrent call through `ensureUserExists` during the accept flow, so the single writer's concurrency-safety becomes load-bearing. **The vanilla rewrite alone does not fix this — it relocates the race from accept-vs-middleware into middleware-vs-middleware unless `ensureUserExists` is hardened.**
- **The inline-create comment admits the workaround**: it exists to "prevent USER_NOT_FOUND deadlock for brand-new invitees" — a problem that only exists because accept is unauthenticated. Authenticating it removes the need.
- **Frontend timing gap**: `acceptInvitation` in the gateway client reads its bearer token from `localStorage`, which `AuthContext` writes _asynchronously_ on `onAuthStateChange`. If accept fires before that write lands, the call is unauthenticated. The vanilla fix must pass the token returned by `signInWithPassword` explicitly into the accept call.
- `TenantMembership` composite PK `(tenant_id, user_id)` has **no `deleted_at`** (`prisma/schema.prisma:553-565`) — a soft-deleted membership still occupies the PK slot, so re-accept must _restore_ rather than insert.
- `UserRepository` (`src/repositories/user-repository.ts`) already exposes `findById`, `findByEmail`, `findBySupabaseId`, `restore` — reuse these.
- `getSupabaseUserIdByEmail` has 3 call sites (accept line 339, set-password line 460, invite-create line 213). Only the **accept** site is removed; the other two stay.
- The existing P2034 Serializable retry loop in accept is a separate, working fix and must be preserved (or rendered moot only because the transaction shrinks).

### Metis Review (carried forward, re-scoped to vanilla)

- Preserve the P2034 retry behavior; don't weaken the expired/used 410 rejections.
- Idempotency + soft-deleted-membership restore are still worth keeping (cheap, prevent a 410 dead-end on retry) — now trivial because there's no user-creation race.
- No schema migration; nullable `supabase_id` stays (invite-before-signup needs it).
- Documentation gotcha #3 misdiagnoses the symptom (says 403/memberless; it's 401 + the dual-write collision) and must be corrected.

---

## Decision Records

### DR-1: Harden `ensureUserExists` for concurrency (ACCEPTED — load-bearing)

The "single creator" invariant is only true if the one writer survives concurrent first-touch. On a new user's first sign-in, `/me` and `/me/tenants` fire in parallel and both call `ensureUserExists` for a not-yet-existing row; the plain `upsert` lets one insert win and the other throw P2002 → 401. This race exists today independent of invitations and **worsens with scale**. We add a find-or-create-under-concurrency guard (catch P2002, re-fetch the same identity). This is the keystone — the accept rewrite alone would merely relocate the race into middleware-vs-middleware.

### DR-2: Single-atomic "complete-invite" endpoint (CONSIDERED — REJECTED for now)

**Option**: collapse the 3-step browser flow (set-password → sign-in → accept) into one server-side `complete-invite` call.

**Why rejected (not merely deferred)**: it _conflicts with_ the single-writer invariant this plan establishes. For a brand-new invitee, an atomic endpoint runs **before** the user has a session, so to create the membership it must **either** create the user row itself (re-introducing the exact second writer we are deleting) **or** perform a server-side sign-in and hand a session back to the browser (more machinery, not less). It is a lateral re-architecture with its own tradeoffs, not a strict simplification.

**Why it's also unnecessary now**: the only real downside of the 3-step flow is partial-failure visibility. Once accept is **idempotent/retryable** (Task 3) and `ensureUserExists` is **concurrency-safe** (DR-1/Task 1c), every step is safely re-runnable — which buys the same user-facing robustness without a new endpoint. Spending a larger, riskier change to buy something idempotency already buys is the over-engineering pattern we are explicitly avoiding.

**Trigger conditions to revisit** (only then): invitation volume high enough that the multi-round-trip latency or partial-state support burden becomes real, OR invitation acceptance moves off the browser (e.g. a native mobile client) where client-side orchestration is genuinely painful. Absent one of these, the idempotent 3-step flow is the simpler **and** safer end-state — do NOT frame the atomic endpoint as an inevitable "scale end-state."

---

## Work Objectives

### Core Objective

Eliminate the dual-write/dual-key race by making `ensureUserExists` the **single, concurrency-safe creator of user rows in the request path**, and by making `/invitations/accept` an authenticated endpoint that only creates (or restores) a tenant membership for the already-existing authenticated user. Two properties together make the "single creator" invariant actually true under load: (1) no second writer in the request path (accept stops creating users), and (2) the one writer survives concurrent first-touch (catch the unique-violation and re-fetch instead of throwing). With both, no accept flow — and no concurrent first-login — can produce a half-created, unreachable, or 401'd account.

> **Scope note on "single creator"**: this means one creator **in the request/auth path**. The platform-owner bootstrap script (`scripts/seed-platform-owner.ts`) also creates user rows — that is a legitimate, out-of-band exception, not a violation. Audits should treat bootstrap as expected.

### Concrete Deliverables

- Read-only diagnostic findings for Olivia's records (and any other affected row).
- Modified `/invitations/accept` route: `authMiddleware` + `requireAuth`, membership-only (uses `req.auth.id`), idempotent, restores soft-deleted memberships, no inline user creation, no `getSupabaseUserIdByEmail` call.
- Modified frontend accept flow: pass the session token from `signInWithPassword` directly into the accept request.
- Proportionate one-off production recovery for Olivia.
- New/updated Vitest tests (unit + integration).
- Corrected `docs/guides/2026-06-10-1118-email-setup.md`.
- Local Docker E2E evidence.

### Definition of Done

- [ ] `pnpm test:unit` green; `pnpm test:integration` green (the `container-boot.test.ts` skip is expected).
- [ ] `/invitations/accept` rejects unauthenticated calls and creates no user rows.
- [ ] There is exactly one user-row creator **in the request path** (`ensureUserExists`), verified by code reading (the `scripts/seed-platform-owner.ts` bootstrap creator is an accepted out-of-band exception).
- [ ] `ensureUserExists` is concurrency-safe: two parallel first-touch calls for the same new user converge on one row, neither 401s (proven by a concurrent integration test).
- [ ] Local E2E: a fresh invitee → set password → sign in → accept → `GET /me` 200 and `GET /me/tenants` non-empty.
- [ ] Olivia's production account resolves (`/me` + `/me/tenants` return her tenant), per the recovery task.

### Must Have

- Diagnose Olivia's real failure mode before fixing.
- **Concurrency-safe `ensureUserExists`** (catch unique-violation + re-fetch) — the load-bearing fix that makes "single creator" true under concurrent first-login.
- Authenticated, membership-only accept endpoint (removes the second writer).
- Frontend explicit-token passing.
- Proportionate Olivia recovery (backup-first).
- Corrected documentation.

### Must NOT Have (Guardrails)

- **MUST NOT** modify `dashboard/src/components/ProtectedRoute.tsx` or `dashboard/src/hooks/use-tenant.ts` (no memberless-UX guard — out of scope).
- **MUST NOT** add a schema migration — no `NOT NULL` and no partial-unique index on `users.supabase_id`.
- **MUST NOT** hard-delete any row anywhere (soft-delete only; recovery uses the existing soft-delete + Supabase Admin paths, never raw `DELETE`).
- **MUST NOT** change the set-password (line ~460) or invite-create (line ~213) `getSupabaseUserIdByEmail` call sites.
- **MUST NOT** re-introduce inline user creation in the accept route, or any second user-creation path.
- **MUST NOT** add heal-on-login, a takeover guard, or an email-fallback reconciliation layer to `ensureUserExists` (those were the symptom-patching complexity of the earlier draft). **Exception — explicitly ALLOWED and required**: making the `upsert` idempotent under concurrency by catching the unique-constraint violation (P2002) and re-fetching the now-existing row. This is the standard find-or-create-under-concurrency pattern, NOT reconciliation — it does not match by email, does not backfill a different identity, and adds no business logic; it only prevents a concurrent duplicate-insert from throwing.
- **MUST NOT** build a generalized scan/heal script or a new admin endpoint for recovery (proportionality — a one-off correction suffices at this scale).
- **MUST NOT** remove or weaken the expired/used `410` rejections or the P2034 retry safety in accept (unless the retry becomes provably unnecessary because the transaction no longer writes users — in which case document why).
- **MUST NOT** run E2E against production cloud Supabase; **MUST NOT** use `@example.com`/`@test.com` in any production verification.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** for the code fix — verification is agent-executed via Vitest + curl. The single production-write step (Olivia recovery) is backup-gated, but its verification (read-only `/me` checks) is agent-readable.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: TDD — RED (failing tests reproducing the dual-write race + the new auth contract) → GREEN
- **Framework**: Vitest (`pnpm test:unit`; `pnpm test:integration` against `ai_employee_test`; `pnpm test:db:setup` once first)

### QA Policy

Every task includes agent-executed QA scenarios; evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Diagnostic/recovery (prod read)**: Bash (PostgREST/psql read via secret key) — read-only assertions
- **Backend/route**: Bash (curl against local gateway :7700) + Vitest
- **Frontend**: local E2E via curl/supabase-js token flow (no browser assertion needed; API-level proof is deterministic)
- **Docs**: grep/read assertion

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Read-only diagnosis of Olivia (ALREADY DONE — see task body) [deep + production-ops]
├── Task 1b: RED tests — concurrency-safe ensureUserExists (parallel first-touch) [ultrabrain]
└── Task 2: RED tests — authenticated, membership-only accept (no user creation, idempotent, restore) [ultrabrain]

Wave 2 (After Wave 1):
├── Task 1c: Implement concurrency-safe ensureUserExists (catch P2002 + re-fetch) → GREEN Task 1b [ultrabrain]   ← LOAD-BEARING
├── Task 3: Implement vanilla accept route (authenticated, membership-only) → GREEN Task 2 [deep]
├── Task 4: Frontend — pass session token explicitly to the accept call [quick]
└── Task 7: Correct email-setup.md documentation + record atomic-endpoint decision [writing]

Wave 3 (After Wave 2):
├── Task 5: Local Docker E2E — fresh invitee reaches a data-populated dashboard [unspecified-high]
└── Task 6: Production recovery for Olivia — VERIFIED HEALTHY, no write needed (confirm only) [deep + production-ops]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 1b → Task 1c (load-bearing) → Task 2 → Task 3 → Task 4 → Task 5 → F1-F4 → user okay
Max Concurrent: 3 (Waves 1 & 2)
```

### Dependency Matrix

- **1 (diagnose)**: blocked by none → blocks 6, 7 — (ALREADY COMPLETE: Olivia is Mode-"already-consistent")
- **1b (RED concurrency)**: blocked by none → blocks 1c
- **1c (concurrency-safe ensureUserExists)**: blocked by 1b → blocks 5 (load-bearing; ship before relying on single-creator under load)
- **2 (RED accept)**: blocked by none → blocks 3
- **3 (vanilla accept)**: blocked by 2 → blocks 4, 5, 6
- **4 (frontend token)**: blocked by 3 → blocks 5
- **7 (docs)**: blocked by 1 → blocks nothing
- **5 (local E2E)**: blocked by 1c, 3, 4 → blocks Final
- **6 (prod recovery/confirm)**: blocked by 1 → blocks Final

### Agent Dispatch Summary

- **Wave 1**: 3 — T1 → `deep`, T1b → `ultrabrain`, T2 → `ultrabrain`
- **Wave 2**: 4 — T1c → `ultrabrain`, T3 → `deep`, T4 → `quick`, T7 → `writing`
- **Wave 3**: 2 — T5 → `unspecified-high`, T6 → `deep`
- **FINAL**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Read-only diagnosis of Olivia's actual production records (confirm the real failure mode) — **DONE**

  > **COMPLETED (2026-06-16).** Production read confirmed Olivia's records are **already fully consistent** — this is neither Mode A, B, nor C; her account self-healed on a retry. Findings:
  >
  > - `users` row: single, `id=4a1268f4-0073-4fe2-9a1d-df80104f3829`, `supabase_id=c0654937-ed35-417e-805c-697215d7f6aa` (matches her Supabase Auth UUID), `status=active`, not deleted.
  > - `tenant_memberships`: **live** row for tenant `00000000-0000-0000-0000-000000000003` (VLRE), role `ADMIN`, `deleted_at=null`.
  > - `tenant_invitations`: status `accepted`.
  > - Simulated `GET /me/tenants` for her → returns `[{tenantId: ...0003, name: VLRE, role: ADMIN}]` (non-empty → dashboard shows data).
  > - **No write was performed** (none was warranted; a membership insert would have hit a duplicate-key conflict).
  >   **Implication for the fix**: her self-heal on reload is the strongest evidence that the real recurring failure is the **concurrent first-login race in `ensureUserExists`** (Task 1b/1c), not the accept-vs-accept race alone — because on reload the user row already existed and both `/me` + `/me/tenants` succeeded. Task 6 is therefore a confirm-only step.

  **What to do** (record of method used):
  - Against **production** (read-only — no writes), retrieve and record the true state for `olivia@vlrealestate.co`:
    1. Her `users` row(s): `SELECT id, supabase_id, email, status, created_at FROM users WHERE email = 'olivia@vlrealestate.co'`. Note whether `supabase_id` is NULL or a real UUID, and whether more than one row exists.
    2. Her membership: `SELECT * FROM tenant_memberships tm JOIN users u ON u.id = tm.user_id WHERE u.email = 'olivia@vlrealestate.co'` — does a (live or soft-deleted) membership exist?
    3. Her invitation: `SELECT id, status, accepted_at, tenant_id, role FROM tenant_invitations WHERE email = 'olivia@vlrealestate.co'` — still `pending`, or `accepted`?
    4. Her Supabase Auth user: `GET {SUPABASE_URL}/auth/v1/admin/users?email=olivia@vlrealestate.co` (apikey + bearer = secret key) — confirm the auth user exists and capture its real UUID.
  - From these four facts, classify which failure mode actually occurred:
    - **Mode A (membership lost)**: `users` row has the correct `supabase_id`, but no membership and invitation still `pending` → the accept transaction lost the race / failed after sign-in. (Heal-on-login would NOT have fixed this — confirms the vanilla membership-only fix is correct.)
    - **Mode B (null auth-ID brick)**: `users` row has `supabase_id = NULL` → the accept transaction won the user-create race with a null ID; subsequent logins 401.
    - **Mode C (other)**: document whatever is actually there.
  - Write the findings + the classification into the plan's evidence and note which recovery path Task 6 should take.
  - **Also scan for any other affected rows** (proportionate, one query — the app has ~2 users): `SELECT id, email, supabase_id FROM users WHERE supabase_id IS NULL AND deleted_at IS NULL` and a memberless-user check. Record the (small) result set.

  **Must NOT do**:
  - Do NOT write, update, or delete anything in production in this task (recovery is Task 6, after a backup).
  - Do NOT build a reusable script — ad-hoc read queries are sufficient at this scale.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: careful production read + correct classification drives the whole plan.
  - **Skills**: [`production-ops`, `prisma`] — `production-ops`: cloud DB session-pooler access, Supabase Admin API, read-only conventions; `prisma`: schema/query semantics, PostgREST-vs-psql.
  - **Skills Evaluated but Omitted**: `security` (no secret mutation; reuses existing secret-key read pattern).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 6, Task 7 — **Blocked By**: None

  **References**:
  - production-ops skill — cloud DB access (session pooler port 5432), Data API reads with `apikey: sb_secret_...`, Render/Supabase specifics.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` § Cloud Setup — cloud ref `gjqrysxpvktmibpkwrvy`, Admin API user lookup pattern.
  - `docs/guides/2026-06-10-1118-email-setup.md:128-151` — the existing recovery queries (note: their _diagnosis_ is wrong; use them only as query templates).
  - `prisma/schema.prisma:535-587` — `User`, `TenantMembership`, `TenantInvitation` shapes.
  - `src/gateway/routes/admin-invitations.ts:79-92` — `getSupabaseUserIdByEmail` shows the exact Admin API call shape to reuse for the auth-user lookup.
  - **WHY**: The original plan assumed a failure mode (timeout/rate-limit) that is implausible at this scale and may not match reality. The fix and recovery must be chosen against Olivia's _actual_ records, not a guess.

  **Acceptance Criteria**:
  - [ ] All four facts (users row, membership, invitation, Supabase auth user) recorded for Olivia.
  - [ ] A definitive Mode A/B/C classification written down.
  - [ ] The (small) set of any other affected rows recorded.
  - [ ] No production writes performed.

  **QA Scenarios**:

  ```
  Scenario: Olivia's true state is captured and classified
    Tool: Bash (psql/PostgREST read against prod, read-only)
    Preconditions: prod read access (session pooler or Data API + secret key)
    Steps:
      1. Run the four read queries; capture raw output
      2. Capture her real Supabase Auth UUID from the Admin API
      3. Write the Mode A/B/C classification with the evidence backing it
    Expected Result: A clear, evidence-backed classification of what failed
    Failure Indicators: Ambiguous/missing data, or any write occurred
    Evidence: .sisyphus/evidence/task-1-olivia-diagnosis.txt

  Scenario: No other (or the full small set of) affected users identified
    Tool: Bash (read query)
    Preconditions: prod read access
    Steps:
      1. Run the null-supabase_id + memberless checks
      2. Record the result set (expected tiny given ~2 users)
    Expected Result: Complete list of affected rows, however small
    Evidence: .sisyphus/evidence/task-1-affected-scan.txt
  ```

  **Commit**: NO (diagnostic only)

- [x] 1b. RED — failing test for concurrent first-login in `ensureUserExists`

  **What to do**:
  - Add a failing integration test that reproduces the real, invitation-independent race: a brand-new user's first sign-in fires `/me` and `/me/tenants` in parallel, so `ensureUserExists` runs twice concurrently for a not-yet-existing row.
  - Concretely, in `tests/integration/auth/ensure-user-exists.test.ts` (or the existing equivalent): with NO pre-existing `users` row for `claims.sub`/`claims.email`, invoke `ensureUserExists(claims)` **N times in parallel** (`Promise.all`, N≥5) for the SAME new identity. Assert:
    1. All N calls resolve successfully (none throws) — currently at least one throws a P2002 unique-constraint violation.
    2. Exactly **one** `users` row exists afterward for that email/`supabase_id` (`prisma.user.count`).
    3. Every resolved result references that same single row id.
  - This mirrors the existing concurrency test pattern in the file (there is already a 3-parallel-calls test — model the new one on it). The test MUST FAIL initially. Do NOT implement the fix here.

  **Must NOT do**:
  - Do NOT modify `src/gateway/services/ensure-user-exists.ts` (implementation is Task 1c).
  - Do NOT use `@example.com` emails.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: concurrency-race test design; must deterministically force the parallel-insert collision.
  - **Skills**: [`prisma`] — test DB seeding/teardown, transaction + unique-constraint semantics.
  - **Skills Evaluated but Omitted**: `api-design` (no route work); `security` (no secret/identity-trust change).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 1c — **Blocked By**: None

  **References**:
  - `src/gateway/services/ensure-user-exists.ts:6-31` — the plain `upsert` keyed on `supabase_id` with no P2002 handling (the function under test).
  - `tests/integration/auth/ensure-user-exists.test.ts` — existing concurrency test (3 parallel calls) to model the new N-parallel test on.
  - `dashboard/src/contexts/AuthContext.tsx` + `dashboard/src/hooks/use-tenant.ts` — the two parallel first-login callers (`/me` and `/me/tenants`) that create the real-world race.
  - `src/gateway/middleware/auth.ts:43,52-54` — `ensureUserExists` is called here and any throw becomes a 401.
  - `prisma/schema.prisma:535-551` — `User` unique columns (`supabase_id`, `email`).
  - **WHY**: Locks the real, scale-sensitive failure (concurrent first-touch → 401) as a failing assertion so Task 1c's GREEN proves the single writer is concurrency-safe.

  **Acceptance Criteria**:
  - [ ] New N-parallel test added to `tests/integration/auth/ensure-user-exists.test.ts`.
  - [ ] `pnpm test:integration -- ensure-user-exists` → the new test FAILS (RED) due to a P2002/unique-violation from a parallel insert.

  **QA Scenarios**:

  ```
  Scenario: Concurrent first-touch test is RED for the right reason
    Tool: Bash (pnpm)
    Preconditions: test DB set up (`pnpm test:db:setup`)
    Steps:
      1. Run: pnpm test:integration -- ensure-user-exists 2>&1 | tee .sisyphus/evidence/task-1b-red.txt
      2. Assert the new N-parallel test exists and FAILS
      3. Assert the failure is a unique-constraint violation (P2002), not a compile/import error
    Expected Result: Test present and RED for the intended concurrency reason
    Failure Indicators: Test passes (no race reproduced), or fails on unrelated errors
    Evidence: .sisyphus/evidence/task-1b-red.txt

  Scenario: No implementation modified
    Tool: Bash (git)
    Steps:
      1. Run: git diff --name-only | tee .sisyphus/evidence/task-1b-files.txt
      2. Assert src/gateway/services/ensure-user-exists.ts is NOT listed
    Expected Result: Only test paths listed
    Evidence: .sisyphus/evidence/task-1b-files.txt
  ```

  **Commit**: NO (groups with Task 1c)

- [x] 1c. Implement concurrency-safe `ensureUserExists` (catch P2002 + re-fetch) → GREEN Task 1b — **LOAD-BEARING**

  **What to do**:
  - Make `ensureUserExists` (`src/gateway/services/ensure-user-exists.ts`) idempotent under concurrency so two+ parallel first-touch calls converge on one row and none throws:
    - Keep the existing `upsert` keyed on `supabase_id` as the primary path.
    - Wrap the create/upsert so that if it throws a **P2002 unique-constraint violation** (a concurrent sibling won the insert), the function **re-fetches** the now-existing row (by `supabase_id`, falling back to `email` if needed) and returns it — instead of letting the error propagate to `authMiddleware` (which would 401).
    - Narrow the catch to P2002 only; re-throw every other error unchanged.
    - Preserve the existing `deleted_at !== null` → throw behavior, and do NOT blank `email` to `''` when `claims.email` is missing (only update email when it is a non-empty string).
  - This is the **standard find-or-create-under-concurrency** pattern. It is explicitly NOT heal-on-login / reconciliation: it does not match a different identity by email, does not backfill a foreign `supabase_id`, and adds no business logic — it only prevents a concurrent duplicate insert from throwing.

  **Must NOT do**:
  - Do NOT add email-fallback reconciliation that overwrites or merges a _different_ identity (that's the rejected complexity). The email re-fetch is only the read-back of the SAME identity after a concurrent insert.
  - Do NOT broaden the catch beyond P2002.
  - Do NOT change the function signature or its callers (`authMiddleware`).
  - Do NOT touch the accept route here (that's Task 3).

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: concurrency-correctness is the single highest-stakes change in the plan; subtle race + constraint handling.
  - **Skills**: [`prisma`] — upsert/transaction semantics, P2002 detection via `isPrismaError`.
  - **Skills Evaluated but Omitted**: `api-design` (no route change); `security` (the takeover/identity-trust concern does NOT apply — we re-fetch the same identity, never adopt a different one).

  **Parallelization**:
  - **Can Run In Parallel**: NO (load-bearing; precede the E2E) — **Parallel Group**: Wave 2 (start it first)
  - **Blocks**: Task 5 — **Blocked By**: Task 1b

  **References**:
  - `src/gateway/services/ensure-user-exists.ts:6-31` — the function to harden.
  - `tests/integration/auth/ensure-user-exists.test.ts` — Task 1b's RED test is the GREEN target; preserve the existing email-update + 3-parallel tests.
  - `src/gateway/lib/prisma-helpers.ts` — `isPrismaError` for narrow P2002 detection (same helper the accept route's P2034 loop uses).
  - `src/repositories/user-repository.ts` — `findBySupabaseId`, `findByEmail` for the re-fetch.
  - `prisma/schema.prisma:535-551` — `User` unique columns.
  - **WHY**: This is what actually makes "single creator" true under load. Without it, the vanilla accept rewrite merely relocates the race into middleware-vs-middleware on first login, which worsens with scale.

  **Acceptance Criteria**:
  - [ ] `pnpm test:integration -- ensure-user-exists` → Task 1b's N-parallel test PASSES (one row, no throw), AND the pre-existing tests still pass.
  - [ ] `pnpm build` + `pnpm lint` clean.
  - [ ] The catch is narrowed to P2002 only (verified by reading the diff); no foreign-identity merge.

  **QA Scenarios**:

  ```
  Scenario: Concurrent first-touch converges on one row (GREEN)
    Tool: Bash (pnpm)
    Preconditions: test DB; Task 1b test present
    Steps:
      1. Run: pnpm test:integration -- ensure-user-exists 2>&1 | tee .sisyphus/evidence/task-1c-green.txt
      2. Assert the N-parallel test PASSES (all resolve, exactly one row, same id)
      3. Assert the pre-existing email-update + 3-parallel tests still PASS
    Expected Result: Previously-RED concurrency test now GREEN; no regressions
    Failure Indicators: Any P2002 still escaping, duplicate rows, or a regressed test
    Evidence: .sisyphus/evidence/task-1c-green.txt

  Scenario: Catch is narrow (no foreign-identity merge)
    Tool: Bash (grep/read)
    Steps:
      1. Read the modified function; confirm the catch checks P2002 specifically and re-fetches the SAME identity
      2. Confirm no email-based merge of a different supabase_id exists
    Expected Result: Narrow find-or-create-under-concurrency only
    Evidence: .sisyphus/evidence/task-1c-scope.txt
  ```

  **Commit**: YES (groups Task 1b + 1c) — `fix(auth): make ensureUserExists concurrency-safe (find-or-create on first login)`
  - Files: `src/gateway/services/ensure-user-exists.ts`, `tests/integration/auth/ensure-user-exists.test.ts`
  - Pre-commit: `pnpm test:integration`

- [ ] 2. RED — failing tests for the authenticated, membership-only accept route

  **What to do**:
  - Add failing tests (integration preferred) encoding the NEW accept contract:
    - **Unauthenticated rejection**: `POST /invitations/accept` with no/invalid bearer token → `401` (the route now sits behind `authMiddleware` + `requireAuth`). Currently it's public, so this fails.
    - **No user creation**: with a valid authenticated caller whose user row already exists (created by `ensureUserExists` via the auth middleware), accepting a valid pending invitation creates a `tenant_memberships` row and marks the invite accepted, and the count of `users` rows for that email stays at exactly 1 (the route creates zero users). Assert via `prisma.user.count({ where: { email } })`.
    - **Idempotent re-accept**: calling accept again when a LIVE membership already exists returns `200` (not 409/410).
    - **Soft-deleted membership restore**: seed a `tenant_memberships` row with `deleted_at != null` for (tenant, user); accept restores it (`deleted_at = null`, role = invite role), no P2002, returns `200`.
    - **Email-mismatch guard**: an authenticated caller whose `req.auth.email` does not match the invitation email → reject (e.g. `403 EMAIL_MISMATCH`), so a signed-in user can't claim someone else's invite. (Confirm desired behavior matches the platform's existing partial check at line 329.)
    - **Expired/used invites still reject** with `410` (regression guard).
  - These tests MUST FAIL initially (the route is still public + creates users). Do NOT implement the fix here.

  **Must NOT do**:
  - Do NOT modify the accept route (implementation is Task 3).
  - Do NOT use `@example.com` emails.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: auth-contract + transaction + constraint-interaction test design.
  - **Skills**: [`prisma`, `api-design`] — `prisma`: seed/soft-delete/test DB; `api-design`: `sendError`/`sendSuccess`/`ERROR_CODES` so assertions match the contract, plus the auth-middleware mounting pattern.
  - **Skills Evaluated but Omitted**: `security` (no secret/encryption change); `inngest` (no workflow code).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3 — **Blocked By**: None

  **References**:
  - `src/gateway/routes/admin-invitations.ts:285-403` — the accept route as it is today (public, creates users, P2034 loop).
  - `src/gateway/middleware/auth.ts:19-59` + `src/gateway/middleware/authz.ts` — `authMiddleware`/`requireAuth` to assert the route now uses.
  - `src/gateway/routes/admin-invitations.ts:329-336` — the existing `req.auth.email === invitation.email` partial check (the email-mismatch guard's basis).
  - `prisma/schema.prisma:553-565` — `TenantMembership` composite PK without `deleted_at`.
  - Existing route-test harness (search `tests/` for how `adminInvitationsRoutes` is mounted with middleware) to reuse for authenticated-request simulation.
  - api-design skill — `ERROR_CODES`; choosing `EMAIL_MISMATCH`.
  - **WHY**: Locks the new contract (authenticated, zero user creation, idempotent, restore) as failing assertions so Task 3's GREEN proves the single-creator invariant.

  **Acceptance Criteria**:
  - [ ] New accept tests added under `tests/`.
  - [ ] `pnpm test:integration -- invitations` → the new tests FAIL (RED) for the expected reasons (route public, creates users).

  **QA Scenarios**:

  ```
  Scenario: New accept-contract tests are RED for the right reasons
    Tool: Bash (pnpm)
    Preconditions: test DB set up
    Steps:
      1. Run: pnpm test:integration -- invitations 2>&1 | tee .sisyphus/evidence/task-2-red.txt
      2. Assert the unauthenticated-rejection test FAILS (route currently public → returns 200/other, not 401)
      3. Assert the no-user-creation test FAILS (route currently creates a user row)
    Expected Result: New tests present and RED for intended reasons
    Failure Indicators: Tests pass, or fail on compile/import errors
    Evidence: .sisyphus/evidence/task-2-red.txt

  Scenario: No route implementation modified
    Tool: Bash (git)
    Steps:
      1. Run: git diff --name-only | tee .sisyphus/evidence/task-2-files.txt
      2. Assert src/gateway/routes/admin-invitations.ts NOT listed
    Expected Result: Only test paths listed
    Evidence: .sisyphus/evidence/task-2-files.txt
  ```

  **Commit**: NO (groups with Task 3)

- [ ] 3. Implement the vanilla accept route — authenticated, membership-only → GREEN Task 2

  **What to do**:
  - In `src/gateway/routes/admin-invitations.ts`, change `/invitations/accept` to:
    1. Mount `authMiddleware` + `requireAuth` on the route. This guarantees `ensureUserExists` has already run and `req.auth` (with `req.auth.id`, `req.auth.email`) is populated before the handler body — the user row provably exists, created by the single auth-ID-keyed path.
    2. **Remove the inline user creation entirely** (the `tx.user.findFirst` / `tx.user.create` block and its `getSupabaseUserIdByEmail` call). Delete the now-dead code — do not comment it out.
    3. In the transaction, use `req.auth.id` as the user id. Validate the invitation (pending, not expired) and that `req.auth.email === invitation.email` (else `403 EMAIL_MISMATCH`).
    4. Membership handling: if a live membership exists → return `200` (idempotent). If a soft-deleted membership exists → restore it (`deleted_at = null`, set role = invitation role). Otherwise create it. Then mark the invitation `accepted`.
    5. Preserve the expired/used `410` rejections. Keep the P2034 retry loop, OR remove it only if the shrunken transaction provably can no longer serialize-conflict — and document that reasoning in the commit if removed.
  - Remove the `getSupabaseUserIdByEmail` import/use from the accept path only (leave the function and its other two call sites intact).
  - All responses via `sendError`/`sendSuccess`.

  **Must NOT do**:
  - Do NOT create or upsert any `users` row in this route.
  - Do NOT touch the set-password or invite-create lookup sites.
  - Do NOT leave dead/commented-out code.
  - Do NOT hard-delete; restore via `deleted_at = null`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: route surgery removing a code path + adding auth, with several edge cases; careful, goal-oriented.
  - **Skills**: [`api-design`, `prisma`] — `api-design`: route+middleware conventions, `sendError`/`sendSuccess`/`ERROR_CODES`; `prisma`: transaction/soft-delete/restore.
  - **Skills Evaluated but Omitted**: `security` (auth wiring uses existing middleware; no new secret handling); `inngest` (no workflow).

  **Parallelization**:
  - **Can Run In Parallel**: NO — **Parallel Group**: Wave 2 (with Tasks 4, 7)
  - **Blocks**: Task 4, Task 5, Task 6 — **Blocked By**: Task 2

  **References**:
  - `src/gateway/routes/admin-invitations.ts:285-403` — the route to rewrite; lines 325-349 are the user-create block to delete; line 329 is the email-match check to formalize.
  - `src/gateway/middleware/auth.ts:43` — `authMiddleware` calls `ensureUserExists`, guaranteeing the user row before the handler runs (the linchpin of the single-creator design).
  - `src/gateway/middleware/authz.ts` — `requireAuth` usage pattern (see other admin routes in this file, e.g. the revoke route lines 539-543).
  - `src/repositories/user-repository.ts` — `findById`, `restore` helpers to reuse.
  - `prisma/schema.prisma:553-565` — `TenantMembership` composite PK (restore-not-insert).
  - `src/gateway/lib/http-response.ts`, `src/gateway/lib/prisma-helpers.ts` — response + P2034 detection helpers.
  - **WHY**: This establishes the single-creator invariant. With accept creating no users, the dual-write race that bricked Olivia cannot recur.

  **Acceptance Criteria**:
  - [ ] `pnpm test:integration -- invitations` → all Task 2 tests GREEN (401 unauth, zero user creation, idempotent 200, restore, email-mismatch 403, expired 410).
  - [ ] `pnpm build` + `pnpm lint` clean.
  - [ ] The accept route contains no `tx.user.create` / `getSupabaseUserIdByEmail` (verified by reading the route).
  - [ ] No commented-out dead code.

  **QA Scenarios**:

  ```
  Scenario: Accept creates a membership but zero users, and rejects unauth
    Tool: Bash (pnpm)
    Preconditions: test DB; Task 2 tests present
    Steps:
      1. Run: pnpm test:integration -- invitations 2>&1 | tee .sisyphus/evidence/task-3-green.txt
      2. Assert unauthenticated accept → 401
      3. Assert authenticated accept → 200, membership created, users count for email stays 1
      4. Assert idempotent re-accept → 200; soft-deleted restore → 200
    Expected Result: All accept-contract tests GREEN
    Failure Indicators: Any user row created by accept, 409/410 on idempotent path, P2002 on restore
    Evidence: .sisyphus/evidence/task-3-green.txt

  Scenario: Single-creator invariant holds in code
    Tool: Bash (grep/read)
    Steps:
      1. Read the accept route; confirm no tx.user.create and no getSupabaseUserIdByEmail call remain
      2. Capture the relevant lines
    Expected Result: Accept creates no users; ensureUserExists is the only creator
    Evidence: .sisyphus/evidence/task-3-single-creator.txt
  ```

  **Commit**: YES (groups Task 2 + 3) — `fix(invitations): make accept authenticated and membership-only (single source of user creation)`
  - Files: `src/gateway/routes/admin-invitations.ts`, `tests/**`
  - Pre-commit: `pnpm test:integration`

- [ ] 4. Frontend — pass the session token explicitly to the accept call

  **What to do**:
  - In the dashboard accept flow (`dashboard/src/pages/AcceptInvitePage.tsx`) and the gateway client (`dashboard/src/lib/gateway.ts`):
    - Capture the session/access token returned by `supabase.auth.signInWithPassword(...)` in the new-user flow (and the current session in the existing-user flow) and pass it directly to `acceptInvitation` rather than relying on the token that `AuthContext` writes to `localStorage` asynchronously.
    - Add an optional `accessToken` argument to `acceptInvitation` in the gateway client; when provided, send it as the `Authorization: Bearer` header for that request (the accept endpoint is now authenticated).
    - Keep the existing `signedIn` guard and error messaging; the change is purely ensuring the accept request is authenticated using the just-minted token.
  - Do NOT change `ProtectedRoute` or `use-tenant`.

  **Must NOT do**:
  - Do NOT modify `dashboard/src/components/ProtectedRoute.tsx` or `dashboard/src/hooks/use-tenant.ts`.
  - Do NOT remove the existing `signedIn`/error-handling logic.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: small, well-scoped client change (pass a token through one call).
  - **Skills**: [`react-dashboard`] — dashboard conventions.
  - **Skills Evaluated but Omitted**: `security` (no secret storage change; just using a session token already in memory).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with Tasks 3, 7) — but coordinate the accept-call shape with Task 3.
  - **Blocks**: Task 5 — **Blocked By**: Task 3

  **References**:
  - `dashboard/src/pages/AcceptInvitePage.tsx:54-87` — `handleSetPassword`: capture the token from `signInWithPassword`'s result and pass to accept; lines 41-52 `handleAcceptOnly` for the existing-user path.
  - `dashboard/src/lib/gateway.ts:573-578` — `acceptInvitation`; `gatewayFetch` (lines 75-94) shows how the bearer header is normally derived from `getAccessToken()` — add an override.
  - `dashboard/src/contexts/AuthContext.tsx:29-44` — shows the token is written to localStorage asynchronously (the timing gap being closed).
  - react-dashboard skill — dashboard conventions.
  - **WHY**: Even with the server now authenticated, relying on async-written localStorage could make the accept request unauthenticated in the timing window. Passing the just-minted token guarantees the call is authenticated.

  **Acceptance Criteria**:
  - [ ] `acceptInvitation` accepts and sends an explicit token when provided.
  - [ ] The new-user accept flow uses the token from `signInWithPassword`.
  - [ ] `pnpm dashboard:build` clean.
  - [ ] `ProtectedRoute.tsx` and `use-tenant.ts` unchanged.

  **QA Scenarios**:

  ```
  Scenario: Accept request carries the just-minted token
    Tool: Bash (grep/read) + dashboard build
    Steps:
      1. Read AcceptInvitePage handleSetPassword; confirm the token from signInWithPassword is passed to acceptInvitation
      2. Read gateway.ts acceptInvitation; confirm it sends the explicit token as Bearer
      3. Run: pnpm dashboard:build 2>&1 | tail -5 | tee .sisyphus/evidence/task-4-build.txt
    Expected Result: Token threaded through; build clean
    Failure Indicators: Still relies solely on localStorage token; build fails
    Evidence: .sisyphus/evidence/task-4-build.txt
  ```

  **Commit**: YES — `fix(dashboard): pass session token to invitation accept`
  - Files: `dashboard/src/pages/AcceptInvitePage.tsx`, `dashboard/src/lib/gateway.ts`
  - Pre-commit: `pnpm dashboard:build`

- [ ] 7. Correct `email-setup.md` documentation + record the atomic-endpoint decision

  **What to do**:
  - Rewrite Known Gotcha #3 in `docs/guides/2026-06-10-1118-email-setup.md` to reflect reality:
    - **Correct symptom**: authenticated requests return **401 INVALID_TOKEN** (auth middleware swallows the error), not 403/memberless.
    - **Correct root cause**: TWO flaws — (a) the OLD design created user rows in two places (`ensureUserExists` by auth-ID, and the public accept transaction by email) which raced on the unique email column; AND (b) `ensureUserExists` itself was not concurrency-safe, so two parallel first-login requests (`/me` + `/me/tenants`) could both insert and one would 401. Reference Task 1's actual finding for Olivia (her records were already consistent — she self-healed on reload, which points to flaw (b) as the recurring cause).
    - **Correct permanent fix**: `ensureUserExists` is now the single, **concurrency-safe** creator (find-or-create: catches the unique-violation and re-fetches), and accept is authenticated + membership-only (no second writer). Phrase the guarantee precisely: the race is eliminated because there is one writer in the request path AND it survives concurrent first-touch — **avoid the overclaim that it is "structurally impossible" by the accept rewrite alone**; the concurrency-safety is what closes it under load.
    - **Correct recovery** for any legacy stuck row: per Task 1/Task 6 findings (create the missing membership for the already-existing authenticated user, or backfill a null auth-ID, or soft-delete + re-invite — whichever the actual mode requires).
  - **Record the atomic-endpoint decision** in the new "Decision Records" section of THIS plan (see below) — the writing agent should ensure that section is present and accurate (it is pre-written in the plan; verify it reads correctly and is not deleted).
  - Do NOT delete the other gotchas; no volatile counts/line-numbers.
  - Update the README "Scripts" table only if a script was added (none in this revised plan).

  **Must NOT do**:
  - Do NOT create a new doc file.
  - Do NOT introduce volatile facts (durability rule).
  - Do NOT describe the single-atomic "complete-invite" endpoint as a planned/inevitable next step — it was deliberately rejected (see Decision Records).

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: precise technical prose; no code.
  - **Skills**: [`writing-guidelines`].
  - **Skills Evaluated but Omitted**: none code-relevant.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: None — **Blocked By**: Task 1 (uses the actual diagnosis)

  **References**:
  - `docs/guides/2026-06-10-1118-email-setup.md:120-151` — current (incorrect) gotcha #2/#3 text + recovery.
  - `src/gateway/middleware/auth.ts:52-54` — the swallowed-error → 401 behavior to describe.
  - Task 1 evidence — the real failure mode to document accurately.
  - AGENTS.md § Documentation Freshness + Durability.
  - **WHY**: Prevents the next engineer from re-misdiagnosing; records that the design (not a transient blip) was the cause and is now fixed.

  **Acceptance Criteria**:
  - [ ] Gotcha #3 states the 401 symptom, BOTH root-cause flaws (dual-write + non-concurrency-safe writer), the concurrency-safe single-creator fix, and the correct recovery.
  - [ ] Gotcha #3 does NOT overclaim "structurally impossible by the accept rewrite alone"; it credits the concurrency-safety for closing the race under load.
  - [ ] The plan's Decision Records section (atomic-endpoint rejection) is present and accurate.
  - [ ] No other gotchas removed; no volatile facts.

  **QA Scenarios**:

  ```
  Scenario: Corrected documentation content present
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "401\|single source\|membership" docs/guides/2026-06-10-1118-email-setup.md | tee .sisyphus/evidence/task-7-doc.txt
      2. Assert the symptom mentions 401 and the fix mentions accept being authenticated / single creator
    Expected Result: Corrected root cause + fix + recovery present
    Failure Indicators: Still says 403/memberless or "create a membership" as the only story
    Evidence: .sisyphus/evidence/task-7-doc.txt
  ```

  **Commit**: YES — `docs(email): correct gotcha #3 root cause and recovery`
  - Files: `docs/guides/2026-06-10-1118-email-setup.md`
  - Pre-commit: none

- [ ] 5. Local Docker E2E — fresh invitee reaches a data-populated dashboard

  **What to do**:
  - With `pnpm dev` running locally (gateway :7700, local Docker Supabase), execute the real flow against a clean state:
    1. Create an invitation for a fresh local email (`e2e-invitee@vlrealestate.co`) via `POST /admin/tenants/:tenantId/invitations` (seeded tenant + SERVICE_TOKEN). Read the token from `tenant_invitations`.
    2. `POST /invitations/set-password` with the token + a password.
    3. Sign in via local Supabase Auth (`${SUPABASE_URL}/auth/v1/token?grant_type=password` or supabase-js) to obtain a JWT.
    4. `POST /invitations/accept` **with the JWT as Authorization: Bearer** (the endpoint is now authenticated) + the token in the body.
    5. With that JWT: `GET /me` → assert `200`; `GET /me/tenants` → assert `200` and a **non-empty** array containing the invited tenant.
    6. Assert `prisma.user.count({ where: { email: 'e2e-invitee@vlrealestate.co' } })` === 1 (single user row — proves the single-creator invariant end-to-end).
    7. **Negative**: call `POST /invitations/accept` WITHOUT a bearer token → assert `401`.
  - Capture all curl commands, JSON responses, and IDs to evidence. Per AGENTS.md E2E mandate: observe real output, not "code looks correct." Clean up any tmux sessions started for `pnpm dev`.

  **Must NOT do**:
  - Do NOT run against production cloud Supabase.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: multi-step live orchestration + verification.
  - **Skills**: [`feature-verification`, `long-running-commands`] — `feature-verification`: real-data verification matrix, zero-rows-is-failure; `long-running-commands`: tmux launch+poll for `pnpm dev` + cleanup.
  - **Skills Evaluated but Omitted**: `e2e-testing` (targets Slack/employee triggers, not the auth/invite path); `playwright` (API-level proof is more deterministic; no browser assertion needed).

  **Parallelization**:
  - **Can Run In Parallel**: NO — **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Final Verification — **Blocked By**: Task 3, Task 4

  **References**:
  - `docs/guides/2026-06-10-1118-email-setup.md:92-110` — invitation API curl + reading the token via PostgREST with the secret key.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` § Dual-Env JWT Profiles + Local dev default — local JWTs verify via HS256.
  - `src/gateway/routes/me.ts:50-95` — `/me/tenants` response shape to assert.
  - AGENTS.md § Database — local connection + `ai_employee`; Kong/auth port note (guide gotcha #2).
  - long-running-commands skill — tmux pattern for `pnpm dev`.
  - **WHY**: Proves a fresh invitee reaches a data-populated dashboard and that the accept endpoint is now correctly authenticated — the user's original failure can no longer happen.

  **Acceptance Criteria**:
  - [ ] Happy-path E2E: `/me` 200, `/me/tenants` non-empty with the tenant.
  - [ ] Single user row for the invitee (count === 1).
  - [ ] Unauthenticated accept → 401.
  - [ ] Evidence captured; tmux sessions cleaned up.

  **QA Scenarios**:

  ```
  Scenario: Fresh invitee lands on a data-populated dashboard
    Tool: Bash (curl) against local :7700 + Supabase local auth
    Preconditions: pnpm dev running; seeded tenant + SERVICE_TOKEN
    Steps:
      1. Create invitation; read token
      2. set-password; sign in → JWT
      3. accept with Bearer JWT; then GET /me and GET /me/tenants with the JWT
      4. Assert /me 200, /me/tenants non-empty with the tenant; user count for email === 1
    Expected Result: Both endpoints 200; tenants non-empty; exactly one user row
    Failure Indicators: 401/403/500, empty tenants, or >1 user row
    Evidence: .sisyphus/evidence/task-5-happy.json

  Scenario: Unauthenticated accept is rejected
    Tool: Bash (curl)
    Steps:
      1. POST /invitations/accept with a valid token in the body but NO Authorization header
      2. Assert 401
    Expected Result: 401 (route is authenticated)
    Evidence: .sisyphus/evidence/task-5-unauth.txt
  ```

  **Commit**: NO (verification only)

- [ ] 6. Production confirmation for Olivia (already verified healthy — confirm-only, likely no write)

  > **Per Task 1 (already done), Olivia's records are already fully consistent** — single `users` row with correct `supabase_id`, live VLRE `ADMIN` membership, invitation `accepted`, simulated `/me/tenants` non-empty. **No recovery write is expected.** This task degrades to a re-confirmation (the state could in principle change between diagnosis and plan execution). If — and only if — a re-read shows she has regressed, fall back to the mode-matched recovery below, backup-first.

  **What to do**:
  - **Re-confirm (read-only)** Olivia's current production state: single `users` row, `supabase_id` non-null + matching her Supabase Auth UUID, a live `tenant_memberships` row for tenant `00000000-0000-0000-0000-000000000003`, and a non-empty simulated `/me/tenants`. If all healthy → record evidence and STOP (no write).
  - **Only if she has regressed**: **backup first** (AGENTS.md mandate; load `production-ops`), then apply the mode-matched recovery:
    - **Membership lost, user row correct**: create the missing `tenant_memberships` row for her existing `users.id` + tenant `...0003`/role; mark the invitation `accepted` if pending.
    - **Null auth-ID**: backfill her real Supabase Auth UUID (`UPDATE users SET supabase_id = '<uuid>' WHERE email = 'olivia@vlrealestate.co' AND supabase_id IS NULL`), then ensure the membership exists.
    - **Mismatch / unhealable**: soft-delete her stale `users`/membership via the existing soft-delete path (NOT raw `DELETE`), revoke the stale invitation, and issue a fresh invitation so she re-accepts cleanly on the now-fixed code.
  - Also re-check the (tiny) affected-row scan from Task 1.

  **Must NOT do**:
  - Do NOT write before taking a backup (applies only if a write turns out to be needed).
  - Do NOT perform any write if the re-confirmation shows she is already healthy.
  - Do NOT hard-delete (`DELETE`) — soft-delete only.
  - Do NOT use `@example.com`/`@test.com` for any re-invite.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: high-stakes, reversible production data operation with verification.
  - **Skills**: [`production-ops`, `prisma`] — `production-ops`: mandatory backup, cloud DB access, Render/Supabase; `prisma`: query/update/soft-delete.
  - **Skills Evaluated but Omitted**: `security` (reuses existing patterns; no new secret handling).

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5) — **Parallel Group**: Wave 3
  - **Blocks**: Final Verification — **Blocked By**: Task 1, Task 3

  **References**:
  - Task 1 evidence — the classification that selects the recovery path.
  - production-ops skill — backup procedure + `database-backups/<timestamp>/`, cloud DB session-pooler access.
  - `docs/guides/2026-06-09-1448-user-auth-rbac.md` § Cloud Setup — cloud ref + Admin API user lookup.
  - `docs/guides/2026-06-10-1118-email-setup.md:128-151` — recovery query templates (use the corrected approach from Task 7).
  - `src/repositories/user-repository.ts` — `softDelete`/`restore` if Mode C.
  - AGENTS.md § Database Backup (MANDATORY) + § Production debugging rule.
  - **WHY**: Resolves the original incident (Olivia) and any collateral rows with a reversible, audited procedure matched to what actually failed.

  **Acceptance Criteria**:
  - [ ] Olivia re-confirmed: single `users` row, non-null matching `supabase_id`, live VLRE membership, non-empty `/me/tenants`.
  - [ ] If healthy (expected): NO write performed, evidence recorded.
  - [ ] If a write was needed: production DB backup taken (path recorded) BEFORE the write; recovery applied; re-verified.
  - [ ] No hard-deletes.

  **QA Scenarios**:

  ```
  Scenario: Backup precedes any write
    Tool: Bash (production-ops backup)
    Steps:
      1. Run the backup procedure; record the path
      2. Assert the backup exists before any UPDATE/INSERT is issued
    Expected Result: Backup present first
    Evidence: .sisyphus/evidence/task-6-backup.txt

  Scenario: Olivia resolves after recovery
    Tool: Bash (read against prod, read-only verification)
    Steps:
      1. Query her users row + membership; assert correct + live
      2. Perform /me + /me/tenants read for her identity; assert 200 + non-empty tenants
    Expected Result: Olivia's account is healthy and resolves to her tenant
    Failure Indicators: missing membership, null/wrong supabase_id, 401 on /me
    Evidence: .sisyphus/evidence/task-6-olivia-verified.txt
  ```

  **Commit**: NO (production data operation; evidence only)

- [ ] 8. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**: After all implementation tasks and the Final Verification Wave pass and the user gives explicit okay, send: `pnpm exec tsx scripts/telegram-notify.ts "✅ invitation-accept-fix complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**: **Category**: `quick` — **Skills**: []
  **Parallelization**: Sequential (last) — **Blocked By**: Final Verification + user okay
  **Acceptance Criteria**: [ ] Telegram notification sent.
  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get an explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for the user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting the user's okay.** Rejection or feedback -> fix -> re-run -> present again -> wait.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists (read file, run the test, curl the endpoint). For each "Must NOT Have": search the codebase and reject with file:line if violated — specifically: any second user-creation path **in the request path** (the `scripts/seed-platform-owner.ts` bootstrap creator is an ACCEPTED exception — do not flag it), any **email-fallback reconciliation that adopts/merges a _different_ identity** added to `ensureUserExists` (NOTE: a narrow P2002-catch-and-refetch of the SAME identity is REQUIRED by Task 1c and must NOT be flagged), any change to `ProtectedRoute.tsx`/`use-tenant.ts`, any new `prisma/migrations/` entry, any raw `DELETE`, any new generalized scan/heal script or admin recovery endpoint, any change to the set-password/invite-create lookup sites, any framing of the atomic "complete-invite" endpoint as a planned next step (DR-2 rejected it). Confirm the DR-1 concurrency fix and DR-2 decision record are present. Confirm evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Concurrency-safe single-creator [PASS/FAIL] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` + `pnpm test:integration`. Review changed files for `as any`/`@ts-ignore`, empty catches, broadened error swallowing, console.log, dead code (the removed inline-create must be gone, not commented out), unused imports, AI slop. Confirm the accept route no longer imports/uses `getSupabaseUserIdByEmail` and no longer creates users.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Unit [N/N] | Integration [N/N] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      From a clean local DB, execute EVERY QA scenario from EVERY task; capture evidence to `.sisyphus/evidence/final-qa/`. Specifically: **concurrent first-login (N parallel `ensureUserExists` for a brand-new user) yields one row and zero 401s** (the load-bearing DR-1 fix); unauthenticated accept is rejected; authenticated accept creates a membership and no user row; idempotent re-accept returns 200; soft-deleted membership is restored; full local E2E returns data via `/me/tenants`.
      Output: `Concurrent-first-login [PASS/FAIL] | Scenarios [N/N pass] | E2E data [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task, read "What to do" and the actual diff (`git diff`). Verify 1:1 — everything in spec built, nothing beyond. Confirm zero forbidden-file changes, zero schema migrations, zero hard-deletes, zero new heal/scan machinery. Detect cross-task contamination and unaccounted changes.
      Output: `Tasks [N/N compliant] | Forbidden changes [CLEAN/N] | Migrations [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

- **Task 2 + 3**: `fix(invitations): make accept authenticated and membership-only (single source of user creation)` — `src/gateway/routes/admin-invitations.ts`, `tests/**`; pre-commit: `pnpm test:integration`
- **Task 4**: `fix(dashboard): pass session token to invitation accept` — `dashboard/src/pages/AcceptInvitePage.tsx`, `dashboard/src/lib/gateway.ts`; pre-commit: `pnpm dashboard:build`
- **Task 7**: `docs(email): correct gotcha #3 root cause and recovery` — `docs/guides/2026-06-10-1118-email-setup.md`; pre-commit: none
- **Task 1**: no commit (diagnostic only)
- **Task 6**: no commit (production data operation; evidence only)

## Success Criteria

### Verification Commands

```bash
pnpm test:unit                 # Expected: green (container-boot skip OK)
pnpm test:integration          # Expected: green
pnpm build                     # Expected: tsc clean
pnpm dashboard:build           # Expected: clean
# Single-creator guard (must return nothing — no user creation in accept):
# (verified by F1/F4 reading the accept route)
git diff --name-only | grep -E 'ProtectedRoute.tsx|use-tenant.ts'   # Expected: empty
git status --short prisma/migrations/                                # Expected: empty
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `ensureUserExists` is the only creator of user rows
- [ ] Local E2E proves `/me/tenants` returns data for a fresh invitee
- [ ] Olivia recovered in production and verified
