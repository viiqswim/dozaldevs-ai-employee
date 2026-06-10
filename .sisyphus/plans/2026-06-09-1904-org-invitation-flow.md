# Organization Invitation Flow — Invite Users + Email Delivery

## TL;DR

> **Quick Summary**: Make the broken org-invitation flow actually work end-to-end: a platform owner / org owner / org admin invites a user with a chosen role, the invitee receives a real email (Mailpit locally, Resend in production) carrying a token link to a new dashboard acceptance page, sets a password (or logs in if they already have an account), and is granted the correct `tenant_membership`.
>
> **Deliverables**:
>
> - A provider-abstracted `EmailService` (`src/lib/email/`): nodemailer→Mailpit locally, official `resend` SDK in prod, selected by `RESEND_API_KEY` presence.
> - Reworked invite-create handler: creates the Supabase auth account with `email_confirm: true`, sets `inviter_id`, supersedes any prior pending invite, sends a custom token-bearing email.
> - A gateway-proxied, token-bound set-password endpoint (browser never holds the Supabase secret key).
> - A fixed accept flow that turns a brand-new invitee into a `user` + `tenant_membership` (no `USER_NOT_FOUND` deadlock).
> - A new PUBLIC dashboard route `/dashboard/accept-invite` + `AcceptInvitePage.tsx` (set-password for new users, log-in for existing).
> - Role-rank privilege cap (ADMIN cannot mint OWNER invites), Zod validation, env wiring, docs.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (env+config) → T2 (EmailProvider) → T5 (invite-create rework) → T7 (accept-flow fix) → T10 (accept page) → F1–F4 → user okay

---

## Context

### Original Request

A platform owner (and org owners/admins) must be able to invite a user to an organization with a chosen role (owner/admin/member/viewer), and the invitation must wire up ALL connections so the invited user can manage the appropriate items in that org (create the `tenant_membership` with the correct `TenantRole`). The invited user must receive an EMAIL — locally via Mailpit, in production via Resend. Scope is ONLY adding users to an org. Explicitly OUT: user removal, deactivation, role-changing, editing existing members. The user also asked to flag any other issues found.

### Interview Summary

**Confirmed decisions**:

- New-user sign-in: a **set-password page** on accept (invitee sets password, gets signed in, membership created).
- Existing Supabase user invited (e.g. `victor@dozaldevs.com`): **detect → ask them to log in, skip set-password** (never overwrite an existing password).
- Email approach: **fully replace** GoTrue's built-in invite email with our custom token-bearing email; GoTrue only creates the auth account.
- Re-invite for an email with a pending invite: **supersede** — revoke old, issue fresh token, send new email.
- Decline: **token-only, no auth** (keep current model).
- Resend client: **official `resend` npm SDK**.
- Production sender: **verified domain**, from-address `noreply@dozaldevs.com`.
- Dashboard base URL for links: prod `https://ai-employees-laaa.onrender.com`, local `http://localhost:7700`.
- Tests: **tests-after** (Vitest) + mandatory agent-executed QA.

**Research findings (5 parallel agents)**:

- The current flow is fundamentally broken (6 backend gaps + no acceptance UI). The platform `tenant_invitations.token` is never delivered to the invitee, so `POST /invitations/accept` is unreachable.
- `sendSupabaseInvite()` posts `{email, email_confirm:false, invite:true}` to `/auth/v1/admin/users`; `invite:true` is a **no-op** in current GoTrue and `/admin/users` sends **no email ever** — this is why Mailpit was empty.
- No standalone email code exists anywhere in `src/`. Pattern to model: `src/lib/telegram-client.ts` (`createHttpClient`) + `src/lib/config.ts` lazy getters. Mailpit already runs (`shared-mailpit`, SMTP `localhost:54324`, web UI `localhost:54325`).
- Dashboard has `SignupPage`/`ForgotPasswordPage`/`AuthCallbackPage`; `gateway.ts` has `inviteMember`/`listInvitations`/`revokeInvitation` but no accept/decline client fns; no `/accept-invite` route exists.

### Metis Review

**Identified gaps (all addressed in this plan)**:

- PLAN-BREAKER: `email_confirm:false` → `signInWithPassword` returns `email_not_confirmed` 400. **Fix: create invitee with `email_confirm: true`** (the platform token is the verification mechanism).
- `/admin/users` always sets a random password — our set-password OVERWRITES it (name/comment accordingly).
- `optionalEnv` does NOT exist in `config.ts` — use `getEnv(name, default)` / lazy arrow getters.
- SECURITY: set-password MUST be gateway-proxied (browser never holds `SUPABASE_SECRET_KEY`); token-bound, status/expiry-gated, single-use, email-match, rate-limited, no token/secret in logs.
- PRIVILEGE CAP: cap invited role at inviter rank (ADMIN cannot mint OWNER; PLATFORM_OWNER + SERVICE_TOKEN bypass).
- Zod: use `UUID_REGEX`/`uuidField()`, never `z.string().uuid()`.
- Do NOT reimplement magic-link/PKCE handling already owned by `AuthCallbackPage`.
- Pre-existing DECLINE-vs-REVOKE error-code inconsistency: note as known issue, do NOT fix.
- Cloud GoTrue rejects `@example.com`/`@test.com` — QA uses `@dozaldevs.com`.

---

## Work Objectives

### Core Objective

Repair and complete the organization-invitation flow so an authorized inviter can add a user to an org with a chosen role, the invitee receives a working email, and accepting it (via set-password for new users or log-in for existing users) creates the correct `tenant_membership` — with zero manual intervention required to verify.

### Concrete Deliverables

- `src/lib/email/email-provider.interface.ts`, `resend-provider.ts`, `smtp-provider.ts`, `index.ts` (factory).
- `src/lib/email/templates/invitation.ts` (HTML + text invite email body builder).
- Reworked `src/gateway/routes/admin-invitations.ts` (create handler: `email_confirm:true`, `inviter_id`, supersede, custom email; new gateway-proxied set-password route; fixed accept ordering).
- Zod schemas in `src/gateway/validation/schemas.ts` for the new/changed request bodies.
- New env vars (`RESEND_API_KEY`, `EMAIL_FROM`, `DASHBOARD_BASE_URL`, `SMTP_URL`) in `config.ts`, `.env`, `.env.example`.
- New PUBLIC route `/dashboard/accept-invite` + `dashboard/src/pages/AcceptInvitePage.tsx`.
- `acceptInvitation(token)`, `declineInvitation(token)`, `setInvitationPassword(token, password)`, `getInvitationByToken(token)` in `dashboard/src/lib/gateway.ts`.
- Unit tests (Vitest) for the EmailProvider factory, template builder, role-cap logic, and accept/set-password handlers.
- Docs: AGENTS.md + README.md + `docs/guides/2026-06-09-1448-user-auth-rbac.md` updates.

### Definition of Done

- [ ] Inviting an email locally produces a real message in Mailpit containing `…/dashboard/accept-invite?token=<64-hex>` (verified via Mailpit HTTP API).
- [ ] Accepting (new user: set-password→sign-in→accept) creates exactly one `tenant_membership` row with the invited role (verified via psql; zero rows = failure).
- [ ] A brand-new invitee can sign in with their new password (no `email_not_confirmed`).
- [ ] An ADMIN-role inviter cannot create an `OWNER` invitation (403); an OWNER can (201).
- [ ] `pnpm test:unit`, `pnpm lint`, `pnpm build` all pass.

### Must Have

- Email delivery: Mailpit local, Resend prod, single `EmailProvider` interface.
- Invite create sets `inviter_id` and creates the Supabase account with `email_confirm: true`.
- Supersede semantics for re-invites.
- Gateway-proxied, token-bound set-password endpoint.
- New-user set-password branch AND existing-user log-in branch on the accept page.
- Role-rank privilege cap on invited role.
- Accept creates `user` + `tenant_membership` for brand-new invitees inside the existing Serializable transaction.
- Zod validation with `UUID_REGEX`.

### Must NOT Have (Guardrails)

- ❌ NO changes to member removal (`DELETE …/members/:userId`), deactivation (`status='disabled'`), or role-change (`PATCH …/members/:userId`) endpoints/UI.
- ❌ NO `SUPABASE_SECRET_KEY` or invitation token in any log line; NO secret key reaching the browser.
- ❌ NO reimplementation of magic-link/PKCE session handling owned by `AuthCallbackPage.tsx`.
- ❌ NO generic "notifications"/"mailer" abstraction beyond the two email providers needed (no premature abstraction).
- ❌ NO "resend invite" / "bulk invite" / "invite analytics" features.
- ❌ NO fix of the pre-existing DECLINE-vs-REVOKE error-code inconsistency (note as known issue only).
- ❌ NO `z.string().uuid()` — use `UUID_REGEX`/`uuidField()`.
- ❌ NO hardcoded model IDs or forbidden Anthropic/OpenAI execution models touched.
- ❌ NO silent fallback to SMTP in production — provider selection must be explicit and logged (provider name only).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. Inbox checks go through the Mailpit HTTP API; link-following is scripted (extract token → call endpoint) or Playwright-driven. No "user manually checks inbox / clicks link / visually confirms" criteria permitted.

### Test Decision

- **Infrastructure exists**: YES (Vitest — `pnpm test:unit`).
- **Automated tests**: Tests-after — implement, then add Vitest unit tests for EmailProvider factory, template builder, role-cap, accept/set-password handlers.
- **Framework**: Vitest.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/API**: Bash (`curl`) → assert status + JSON fields; psql → assert DB rows (zero-rows-is-failure).
- **Email**: Mailpit HTTP API `GET http://localhost:54325/api/v1/messages` → assert message exists, body contains token link.
- **Frontend**: Playwright at `http://localhost:7700/dashboard/` → navigate, fill, click, assert DOM, screenshot, capture network.
- **Library/unit**: `pnpm test:unit` (Vitest), mock the `resend` SDK (no live send).

### QA Constants

- Tenant (VLRE): `00000000-0000-0000-0000-000000000003`. Tenant (DozalDevs): `00000000-0000-0000-0000-000000000002`.
- QA invitee email: `qa-invitee-<timestamp>@dozaldevs.com` (avoid `@example.com`/`@test.com`).
- Local PLATFORM_OWNER: `owner@test.com` / `Test1234!`. SERVICE_TOKEN from `.env`.
- Mailpit web API: `http://localhost:54325/api/v1/messages`. DB: `postgresql://postgres:postgres@localhost:54322/ai_employee`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundations, no cross-deps):
├── Task 1: Env vars + config.ts lazy getters [quick]
├── Task 2: EmailProvider interface + SMTP + Resend impls + factory [unspecified-high]
├── Task 3: Invitation email template builder (HTML+text) [visual-engineering]
├── Task 4: Zod schemas for new/changed request bodies [quick]
└── Task 9: dashboard gateway.ts client fns (accept/decline/set-password/getByToken) [quick]

Wave 2 (After Wave 1 — backend handlers + dashboard wiring):
├── Task 5: Rework invite-create handler (email_confirm:true, inviter_id, supersede, send email, role cap) (deps 2,3,4) [deep]
├── Task 6: Gateway-proxied set-password endpoint (token-bound, gated, rate-limited) (deps 4) [deep]
├── Task 7: Fix accept handler ordering — create user+membership for brand-new invitee (deps 4) [deep]
├── Task 8: getInvitationByToken read endpoint (new-vs-existing user hint) (deps 4) [unspecified-high]
└── Task 10: AcceptInvitePage.tsx + public route in App.tsx (deps 9) [visual-engineering]

Wave 3 (After Wave 2 — tests + docs):
├── Task 11: Vitest unit tests (EmailProvider factory, template, role-cap, accept/set-password) (deps 5,6,7) [unspecified-high]
└── Task 12: Docs — AGENTS.md + README.md + user-auth-rbac guide (deps 5,6,7,8,10) [writing]

Wave FINAL (after ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — live invite→Mailpit→accept→membership E2E (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay -> Task 13: Notify completion

Critical Path: T1 → T2 → T5 → T7 → T10 → F1–F4 → user okay
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

- **1**: deps none — blocks 2,5,6,7,8,12
- **2**: deps 1 — blocks 5,11
- **3**: deps 1 — blocks 5,11
- **4**: deps none — blocks 5,6,7,8
- **5**: deps 2,3,4 — blocks 11,12
- **6**: deps 4 — blocks 11,12
- **7**: deps 4 — blocks 11,12
- **8**: deps 4 — blocks 10,12
- **9**: deps none — blocks 10
- **10**: deps 8,9 — blocks 12
- **11**: deps 5,6,7 — blocks F\*
- **12**: deps 5,6,7,8,10 — blocks F\*

### Agent Dispatch Summary

- **Wave 1**: 5 — T1 → `quick`, T2 → `unspecified-high`, T3 → `visual-engineering`, T4 → `quick`, T9 → `quick`
- **Wave 2**: 5 — T5 → `deep`, T6 → `deep`, T7 → `deep`, T8 → `unspecified-high`, T10 → `visual-engineering`
- **Wave 3**: 2 — T11 → `unspecified-high`, T12 → `writing`
- **FINAL**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. EVERY task has Recommended Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Add email/link env vars + config.ts lazy getters

  **What to do**:
  - Add lazy getters to `src/lib/config.ts` following the existing arrow-function pattern (`export const X = (): string => process.env.X ?? '…'`): `RESEND_API_KEY` (default `''`), `EMAIL_FROM` (default `'DozalDevs <noreply@dozaldevs.com>'`), `DASHBOARD_BASE_URL` (default `'http://localhost:7700'`), `SMTP_URL` (default `'smtp://localhost:54324'`).
  - Add matching entries to `.env` and `.env.example` IN THE CORRECT SECTION ORDER (per README "Section Order"): create a new "Email" section between section 9 (Slack) and section 10 (Webhooks). Each var gets a description comment in `.env.example`. Production values noted in comments: `EMAIL_FROM=DozalDevs <noreply@dozaldevs.com>`, `DASHBOARD_BASE_URL=https://ai-employees-laaa.onrender.com`, `RESEND_API_KEY=re_…`.
  - Do NOT add these to `platform_settings` (they are secrets/operational env vars).

  **Must NOT do**:
  - Do NOT use `optionalEnv` (it does not exist in `config.ts` — only in `worker-tools/`). Use lazy arrow getters or `getEnv(name, default)`.
  - Do NOT add a hardcoded `RESEND_API_KEY` value anywhere.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: small, mechanical config + env edits across 3 files.
  - **Skills**: [`data-access-conventions`] — config/env access conventions.
  - **Skills Evaluated but Omitted**: `security` — no secret storage/encryption added here, just env getters.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with Tasks 2,3,4,9)
  - **Blocks**: 2,5,6,7,8,12 — **Blocked By**: None (can start immediately)

  **References**:
  - **Pattern References**: `src/lib/config.ts` — existing lazy getter exports (e.g. the Slack/Google getters like `() => process.env.X ?? ''`); follow this exact style.
  - **External References**: README.md "Environment File Conventions" → "Section Order (mandatory)" — the 14-section ordering rule for `.env`/`.env.example`.
  - **WHY**: The executor must place new vars in the exact mandated section and mirror the lazy-getter style so the rest of the codebase reads them consistently.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes with the new getters referenced (or unreferenced) — no TS errors.
  - [ ] `.env` and `.env.example` both contain all 4 new vars in the new "Email" section; `grep -c "RESEND_API_KEY\|EMAIL_FROM\|DASHBOARD_BASE_URL\|SMTP_URL" .env.example` == 4.

  **QA Scenarios**:

  ```
  Scenario: Config getters return env values (happy path)
    Tool: Bash (node/tsx one-liner)
    Preconditions: RESEND_API_KEY unset in shell
    Steps:
      1. Run: pnpm exec tsx -e "import {RESEND_API_KEY, EMAIL_FROM, DASHBOARD_BASE_URL, SMTP_URL} from './src/lib/config.js'; console.log(JSON.stringify({r:RESEND_API_KEY(), f:EMAIL_FROM(), d:DASHBOARD_BASE_URL(), s:SMTP_URL()}))"
      2. Assert output JSON: r === "" (empty), f contains "noreply@dozaldevs.com", d === "http://localhost:7700", s === "smtp://localhost:54324"
    Expected Result: All four getters resolve to their documented defaults.
    Failure Indicators: import error, undefined getter, wrong default.
    Evidence: .sisyphus/evidence/task-1-config-getters.txt

  Scenario: .env / .env.example in sync (negative)
    Tool: Bash
    Preconditions: none
    Steps:
      1. Run: for v in RESEND_API_KEY EMAIL_FROM DASHBOARD_BASE_URL SMTP_URL; do grep -q "^#*\s*$v" .env.example && grep -q "$v" .env || echo "MISSING:$v"; done
      2. Assert: no "MISSING:" lines printed.
    Expected Result: every new var present in BOTH files.
    Evidence: .sisyphus/evidence/task-1-env-sync.txt
  ```

  **Commit**: groups with Wave 1.

- [x] 2. Build EmailProvider abstraction (interface + SMTP + Resend + factory)

  **What to do**:
  - Create `src/lib/email/email-provider.interface.ts` exporting `SendEmailOptions { to: string|string[]; subject: string; html: string; text?: string; replyTo?: string }`, `SendEmailResult { id: string }`, and `EmailProvider { send(options): Promise<SendEmailResult> }`.
  - Create `src/lib/email/resend-provider.ts`: `ResendEmailProvider implements EmailProvider` using the official `resend` SDK (`new Resend(apiKey)` → `client.emails.send({ from, to, subject, html, text, replyTo })`). Throw a clear `Error` including `error.name` + `error.message` when the SDK returns `{ error }`. Constructor takes `(apiKey, fromAddress)`.
  - Create `src/lib/email/smtp-provider.ts`: `SmtpEmailProvider implements EmailProvider` using `nodemailer.createTransport(smtpUrl)` → `transporter.sendMail({ from, to, subject, html, text, replyTo })`; return `{ id: info.messageId }`. Constructor takes `(smtpUrl, fromAddress)`.
  - Create `src/lib/email/index.ts`: `createEmailProvider()` factory — if `RESEND_API_KEY()` is non-empty → `ResendEmailProvider(RESEND_API_KEY(), EMAIL_FROM())`; else → `SmtpEmailProvider(SMTP_URL(), EMAIL_FROM())`. Log the SELECTED provider NAME only (never the key) via `createLogger`. Export a memoized singleton getter `getEmailProvider()` and re-export the interface types.
  - Add deps: `pnpm add resend nodemailer` and `pnpm add -D @types/nodemailer`.

  **Must NOT do**:
  - Do NOT add a third provider, a generic "notification service", template logic, or queueing — interface + 2 impls + factory ONLY.
  - Do NOT log the API key or full email bodies; do NOT silently fall back to SMTP when `RESEND_API_KEY` is set but invalid.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: new module with an external SDK + a transport library; needs correct typing and error handling, moderate effort.
  - **Skills**: [`data-access-conventions`] — outbound integration + config conventions.
  - **Skills Evaluated but Omitted**: `security` — no secret storage; key comes from env. `adding-shell-tools` — not a worker tool.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with 1,3,4,9)
  - **Blocks**: 5,11 — **Blocked By**: 1 (needs the new config getters)

  **References**:
  - **Pattern References**: `src/lib/telegram-client.ts` — the canonical simple outbound-client shape (factory + typed methods + error handling); `src/lib/http-client.ts:createHttpClient` (used by telegram-client) for the retry/error pattern if a raw path is ever needed.
  - **API/Type References**: `resend` SDK `emails.send()` returns `{ data: { id } | null, error: { name, message } | null }`; `from` must be `"Name <email@domain>"`; `to` max 50.
  - **External References**: Resend docs `https://resend.com/docs/api-reference/emails/send-email`; nodemailer `createTransport(url)` + `sendMail()` returning `{ messageId }`.
  - **WHY**: telegram-client.ts is the closest existing analog — copy its construction + logging discipline so this fits the codebase exactly.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes; `resend` + `nodemailer` + `@types/nodemailer` in package.json.
  - [ ] Factory returns `SmtpEmailProvider` when `RESEND_API_KEY` empty, `ResendEmailProvider` when set.

  **QA Scenarios**:

  ```
  Scenario: Factory selects SMTP locally, Resend when keyed (happy path)
    Tool: Bash (tsx)
    Preconditions: none
    Steps:
      1. Run with RESEND_API_KEY unset: pnpm exec tsx -e "import {createEmailProvider} from './src/lib/email/index.js'; console.log(createEmailProvider().constructor.name)"
      2. Assert output === "SmtpEmailProvider"
      3. Run with RESEND_API_KEY=re_test: RESEND_API_KEY=re_test pnpm exec tsx -e "import {createEmailProvider} from './src/lib/email/index.js'; console.log(createEmailProvider().constructor.name)"
      4. Assert output === "ResendEmailProvider"
    Expected Result: provider chosen by RESEND_API_KEY presence.
    Failure Indicators: same class both times, import/throw error.
    Evidence: .sisyphus/evidence/task-2-factory-select.txt

  Scenario: SMTP provider actually delivers to Mailpit (integration happy path)
    Tool: Bash (tsx) + Mailpit HTTP API
    Preconditions: shared-mailpit running (curl http://localhost:54325/api/v1/messages returns JSON)
    Steps:
      1. Run: pnpm exec tsx -e "import {SmtpEmailProvider} from './src/lib/email/smtp-provider.js'; const p=new SmtpEmailProvider('smtp://localhost:54324','test@dozaldevs.com'); p.send({to:'probe-<ts>@dozaldevs.com',subject:'QA probe',html:'<p>hi</p>',text:'hi'}).then(r=>console.log(r.id))"
      2. Assert: a messageId printed (no throw).
      3. Run: curl -s "http://localhost:54325/api/v1/messages" | jq '[.messages[]|select(.To[].Address=="probe-<ts>@dozaldevs.com")]|length'
      4. Assert: result === 1
    Expected Result: email lands in Mailpit.
    Evidence: .sisyphus/evidence/task-2-mailpit-deliver.json

  Scenario: Resend provider surfaces send errors (negative)
    Tool: Bash (tsx) with mocked/invalid key
    Preconditions: none
    Steps:
      1. Run: RESEND_API_KEY=re_invalid pnpm exec tsx -e "import {ResendEmailProvider} from './src/lib/email/resend-provider.js'; new ResendEmailProvider('re_invalid','onboarding@resend.dev').send({to:'x@dozaldevs.com',subject:'x',html:'x'}).then(()=>console.log('NO_ERROR')).catch(e=>console.log('ERR:'+e.message))"
      2. Assert: output starts with "ERR:" (error thrown, not swallowed).
    Expected Result: invalid send rejects with a descriptive error.
    Evidence: .sisyphus/evidence/task-2-resend-error.txt
  ```

  **Commit**: groups with Wave 1.

- [x] 3. Invitation email template builder (HTML + text)

  **What to do**:
  - Create `src/lib/email/templates/invitation.ts` exporting `buildInvitationEmail(params: { acceptUrl: string; organizationName: string; inviterName?: string; role: string }): { subject: string; html: string; text: string }`.
  - Subject: `You've been invited to join ${organizationName}`. Body (plain, non-technical, concise per repo voice): a short greeting, who invited them (if known), the org name, the role in plain English, a prominent "Accept invitation" button/link pointing to `acceptUrl`, and a note that the link expires in 7 days. Provide BOTH an `html` (simple inline-styled, email-client-safe) and a `text` fallback.
  - Use plain non-technical language ("Organization", "Accept invitation"), no jargon.

  **Must NOT do**:
  - Do NOT embed the raw token anywhere except inside `acceptUrl`. Do NOT include any secret, internal IDs, or technical terms. Do NOT add a templating engine — return strings.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: email HTML/copy with attention to layout and plain-language UX.
  - **Skills**: [] — small self-contained copy/markup task.
  - **Skills Evaluated but Omitted**: `react-dashboard` — this is email HTML, not the dashboard.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with 1,2,4,9)
  - **Blocks**: 5,11 — **Blocked By**: 1 (uses no config directly but groups with Wave 1; can also start immediately)

  **References**:
  - **Pattern References**: repo convention "End-user language is non-technical" and "AI employee outputs should be concise" (AGENTS.md Key Conventions) — apply to the email copy.
  - **WHY**: The invitee is a non-technical business user; the copy must be plain and short, matching platform voice.

  **Acceptance Criteria**:
  - [ ] `buildInvitationEmail()` returns `{ subject, html, text }` all non-empty; `html` and `text` both contain the exact `acceptUrl`.
  - [ ] No technical jargon (no "tenant", "archetype", "token") in subject/body copy (the URL may contain `token=`).

  **QA Scenarios**:

  ```
  Scenario: Template includes accept URL and plain language (happy path)
    Tool: Bash (tsx)
    Preconditions: none
    Steps:
      1. Run: pnpm exec tsx -e "import {buildInvitationEmail} from './src/lib/email/templates/invitation.js'; const e=buildInvitationEmail({acceptUrl:'http://localhost:7700/dashboard/accept-invite?token=abc',organizationName:'VLRE',inviterName:'Victor',role:'Member'}); console.log(JSON.stringify({subjHasOrg:e.subject.includes('VLRE'), htmlHasUrl:e.html.includes('token=abc'), textHasUrl:e.text.includes('token=abc'), noTenant:!/tenant|archetype/i.test(e.subject+e.html)}))"
      2. Assert: subjHasOrg true, htmlHasUrl true, textHasUrl true, noTenant true
    Expected Result: well-formed, jargon-free, contains the accept URL in both parts.
    Evidence: .sisyphus/evidence/task-3-template.txt

  Scenario: Missing inviter name still renders (edge)
    Tool: Bash (tsx)
    Steps:
      1. Run buildInvitationEmail without inviterName; assert no "undefined" appears in html/text.
    Expected Result: graceful copy when inviter unknown.
    Evidence: .sisyphus/evidence/task-3-template-noinviter.txt
  ```

  **Commit**: groups with Wave 1.

- [x] 4. Zod schemas for new/changed invitation request bodies

  **What to do**:
  - In `src/gateway/validation/schemas.ts` add schemas: `acceptInvitationSchema` (`{ token: string }` — non-empty hex), `declineInvitationSchema` (`{ token: string }`), `setInvitationPasswordSchema` (`{ token: string; password: string }` with a min-length/strength rule, e.g. ≥8 chars), and ensure the create-invitation body schema validates `{ email: string (email), role: TenantRole enum }`.
  - For ANY route param that is a tenant/invitation UUID, use the existing loose `UUID_REGEX` / `uuidField()` helper — NEVER `z.string().uuid()`.

  **Must NOT do**:
  - Do NOT use `z.string().uuid()` (RFC-strict, rejects valid UUIDs). Do NOT accept a `user_id`/`email` field in `setInvitationPasswordSchema` — the email is derived from the token server-side (security: prevents targeting another account).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: a few small, well-scoped Zod schema additions.
  - **Skills**: [`api-design`] — Zod validation + UUID_REGEX quirk + sendError conventions.
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with 1,2,3,9)
  - **Blocks**: 5,6,7,8 — **Blocked By**: None

  **References**:
  - **Pattern References**: `src/gateway/validation/schemas.ts` — existing schema style + the `UUID_REGEX`/`uuidField()` helper (AGENTS.md: "Zod v4 UUID validation" quirk).
  - **API/Type References**: `TenantRole` enum (`OWNER|ADMIN|MEMBER|VIEWER`) from `@prisma/client`.
  - **WHY**: Consistent validation + the UUID_REGEX rule prevents the known Zod-v4 UUID rejection bug.

  **Acceptance Criteria**:
  - [ ] New schemas exported and used by the Wave-2 handlers; `setInvitationPasswordSchema` has NO user_id/email field.
  - [ ] `grep -n "z.string().uuid()" src/gateway/validation/schemas.ts` returns nothing (no strict UUID).

  **QA Scenarios**:

  ```
  Scenario: setInvitationPasswordSchema rejects extra target fields (security/negative)
    Tool: Bash (tsx)
    Preconditions: none
    Steps:
      1. Run: pnpm exec tsx -e "import {setInvitationPasswordSchema} from './src/gateway/validation/schemas.js'; const r=setInvitationPasswordSchema.safeParse({token:'abc',password:'Test1234!',email:'evil@x.com'}); console.log(JSON.stringify({ok:r.success, hasEmail: r.success ? ('email' in r.data) : false}))"
      2. Assert: parse succeeds but r.data has NO `email` key (stripped) — i.e. hasEmail === false. (If schema is strict, parse may fail; either way email must never reach the handler.)
    Expected Result: email/user_id can never be passed through to set a password on another account.
    Evidence: .sisyphus/evidence/task-4-schema-strip.txt

  Scenario: Weak password rejected (negative)
    Tool: Bash (tsx)
    Steps:
      1. Run safeParse with password:"123"; assert r.success === false.
    Expected Result: password policy enforced at the boundary.
    Evidence: .sisyphus/evidence/task-4-weak-pw.txt
  ```

  **Commit**: groups with Wave 1.

- [x] 9. Dashboard gateway client fns (accept / decline / set-password / getByToken)

  **What to do**:
  - In `dashboard/src/lib/gateway.ts` add: `getInvitationByToken(token)` → `GET /invitations/:token` (or `/invitations/lookup?token=…` per Task 8's chosen shape) returning `{ email, organizationName, role, status, isExistingUser }`; `setInvitationPassword(token, password)` → `POST /invitations/set-password` body `{ token, password }`; `acceptInvitation(token)` → `POST /invitations/accept` body `{ token }`; `declineInvitation(token)` → `POST /invitations/decline` body `{ token }`.
  - These are token-only public endpoints — do NOT attach the `Authorization` Bearer header (use the wrapper's no-auth path, or plain `gatewayFetch` which omits the header when no token exists). Match the existing `gatewayFetch` style and error-throw behavior.

  **Must NOT do**:
  - Do NOT call the Supabase admin API from the browser. Do NOT touch `removeMember`/`changeMemberRole` (out of scope). Do NOT use raw `fetch` (use `gatewayFetch` for consistency; the `removeMember` raw-fetch inconsistency is pre-existing and out of scope).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: 4 thin client functions mirroring existing ones.
  - **Skills**: [`react-dashboard`] — dashboard conventions.
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with 1,2,3,4)
  - **Blocks**: 10 — **Blocked By**: None

  **References**:
  - **Pattern References**: `dashboard/src/lib/gateway.ts` — `inviteMember`/`listInvitations`/`revokeInvitation` (the exact `gatewayFetch` call shape to copy); `getAccessToken()` reads `localStorage('supabase_access_token')`.
  - **WHY**: Mirror the existing invitation client fns so the new ones are consistent; these four are the dashboard's only way to reach the new public endpoints.

  **Acceptance Criteria**:
  - [ ] Four exported functions present, typed, using `gatewayFetch`; no `Authorization` header forced on the token-only calls.
  - [ ] `pnpm dashboard:build` (or `pnpm build`) compiles with the new fns.

  **QA Scenarios**:

  ```
  Scenario: Client fns target correct endpoints (happy path — static assertion)
    Tool: Bash (grep)
    Preconditions: none
    Steps:
      1. Run: grep -E "invitations/(accept|decline|set-password)|getInvitationByToken|setInvitationPassword|acceptInvitation|declineInvitation" dashboard/src/lib/gateway.ts
      2. Assert: all four function names + the three endpoint paths appear.
    Expected Result: client layer wired to the new routes.
    Evidence: .sisyphus/evidence/task-9-client-fns.txt

  Scenario: No Authorization header on token-only calls (negative/security)
    Tool: Bash (grep/read)
    Steps:
      1. Inspect the new fns; assert none explicitly inject a Bearer token for accept/decline/set-password/getByToken.
    Expected Result: public endpoints called without auth header.
    Evidence: .sisyphus/evidence/task-9-no-auth.txt
  ```

  **Commit**: groups with Wave 1.

- [x] 5. Rework invite-create handler (email_confirm:true, inviter_id, supersede, send custom email, role cap)

  **What to do**:
  - In `src/gateway/routes/admin-invitations.ts`, rewrite `sendSupabaseInvite()` → create the Supabase auth account via `POST {SUPABASE_URL}/auth/v1/admin/users` with body `{ email, email_confirm: true }` (NOT `false`, NOT `invite:true`). Continue to swallow `422` (user already exists). Capture/return the Supabase user id when created.
  - In the create handler (`POST /admin/tenants/:tenantId/invitations`): (a) **role cap** — reject with 403 if the inviter's effective tenant rank is below the requested role (ADMIN cannot create OWNER); PLATFORM_OWNER and SERVICE_TOKEN bypass. Use the role-rank order `OWNER(4)>ADMIN(3)>MEMBER(2)>VIEWER(1)`. (b) **supersede** — if a `pending` invitation already exists for `(tenant_id, email)`, mark it `revoked` (set `revoked_at`) before creating the new one. (c) set `inviter_id: req.auth?.id ?? null` in the `tenantInvitation.create` data. (d) After creating the invitation, build `acceptUrl = ${DASHBOARD_BASE_URL()}/dashboard/accept-invite?token=${token}` and send via `getEmailProvider().send(buildInvitationEmail({ acceptUrl, organizationName, inviterName, role }))`. Resolve `organizationName` from the tenant record. If email send throws, return `sendError(res, 500, 'INVITE_EMAIL_FAILED', …)` and do NOT leave a dangling pending invite (either send before commit or roll back/revoke on failure).
  - Use `sendError`/`sendSuccess` for all responses. Keep all queries tenant-scoped.

  **Must NOT do**:
  - Do NOT call GoTrue's `/invite` or send any GoTrue email. Do NOT log the token or secret key. Do NOT use `email_confirm:false`. Do NOT touch decline/revoke error codes. Do NOT change member removal/role-change endpoints.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: core security-sensitive handler rework with several interacting concerns (auth account, role cap, supersede, email, transactionality).
  - **Skills**: [`api-design`, `security`, `data-access-conventions`] — route/response conventions, role/privilege checks, DB + outbound HTTP conventions.
  - **Skills Evaluated but Omitted**: `inngest` — no workflow changes.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with 6,7,8,10)
  - **Blocks**: 11,12 — **Blocked By**: 2,3,4

  **References**:
  - **Pattern References**: `src/gateway/routes/admin-invitations.ts:68-160` — current `sendSupabaseInvite()` + create handler to rewrite; `src/gateway/middleware/authz.ts` — `requireTenantRole` + the role-rank order (OWNER>ADMIN>MEMBER>VIEWER) and PLATFORM_OWNER/SERVICE_TOKEN bypass to mirror for the role cap.
  - **API/Type References**: GoTrue `POST /auth/v1/admin/users` with `{ email, email_confirm: true }` creates a confirmed user (so later password sign-in works); `req.auth` shape from `src/lib/auth/types.ts` (`AuthenticatedUser` with `id`).
  - **External References**: GoTrue admin create — confirmed-at-creation is required because `signInWithPassword` blocks on unconfirmed email; `/admin/users` never sends email.
  - **WHY (Metis)**: `email_confirm:true` is the fix that makes the brand-new-invitee sign-in work; the platform token is the verification mechanism since we replace GoTrue's email.

  **Acceptance Criteria**:
  - [ ] Inviting locally creates a `pending` invitation with `inviter_id` set (when invited by a JWT user) and sends a Mailpit email containing the `accept-invite?token=` link.
  - [ ] Created Supabase user has `email_confirmed_at` NOT NULL (psql on `auth.users`).
  - [ ] ADMIN inviter requesting `role:OWNER` → 403; OWNER → 201.
  - [ ] Second invite for the same pending email revokes the first and sends a fresh link.

  **QA Scenarios**:

  ```
  Scenario: Invite sends real email + sets inviter_id + confirms user (happy path)
    Tool: Bash (curl) + Mailpit API + psql
    Preconditions: gateway up (curl localhost:7700/health), Mailpit up, SERVICE_TOKEN in env
    Steps:
      1. TS=$(date +%s); EMAIL="qa-invitee-$TS@dozaldevs.com"
      2. curl -s -o /tmp/t5-create.json -w "%{http_code}" -X POST http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/invitations -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"role\":\"MEMBER\"}"  → assert 201
      3. curl -s "http://localhost:54325/api/v1/messages" | jq "[.messages[]|select(.To[].Address==\"$EMAIL\")]|length"  → assert 1
      4. Fetch message body, assert it contains "/dashboard/accept-invite?token=" + 64-hex.
      5. psql … -c "SELECT (inviter_id IS NOT NULL) AS has_inviter, status, role FROM tenant_invitations WHERE email='$EMAIL';"  → status=pending, role=MEMBER (inviter null is acceptable for SERVICE_TOKEN; when run with a JWT user it must be non-null — note which path).
      6. psql … -c "SELECT (email_confirmed_at IS NOT NULL) FROM auth.users WHERE email='$EMAIL';"  → assert true.
    Expected Result: email delivered, invitation persisted, Supabase user confirmed.
    Evidence: .sisyphus/evidence/task-5-invite-happy.json

  Scenario: Role cap blocks ADMIN minting OWNER (security/negative)
    Tool: Bash (curl) with an ADMIN-tenant-role JWT (not OWNER/PLATFORM_OWNER)
    Preconditions: obtain an ADMIN-role JWT for the tenant
    Steps:
      1. POST …/invitations with {"email":"qa-cap-$TS@dozaldevs.com","role":"OWNER"} using the ADMIN JWT → assert 403.
      2. Repeat with an OWNER JWT → assert 201.
    Expected Result: privilege escalation prevented.
    Evidence: .sisyphus/evidence/task-5-role-cap.txt

  Scenario: Re-invite supersedes prior pending (edge)
    Tool: Bash (curl) + psql
    Steps:
      1. Invite EMAIL twice. After 2nd: psql count of pending invites for (tenant,email) === 1; the older row status='revoked'; newest token differs.
    Expected Result: exactly one active pending invite; old one revoked.
    Evidence: .sisyphus/evidence/task-5-supersede.txt
  ```

  **Commit**: groups with Wave 2.

- [x] 6. Gateway-proxied set-password endpoint (token-bound, gated, rate-limited)

  **What to do**:
  - Add `POST /invitations/set-password` (no auth header; token-driven) to `admin-invitations.ts`. Validate body with `setInvitationPasswordSchema` ({ token, password } ONLY).
  - Logic: look up invitation by `token`; reject if not found (404), not `pending` (410 `ALREADY_USED`), or expired (410 `EXPIRED`). Resolve the Supabase user by `invitation.email`. Set the password via `PUT {SUPABASE_URL}/auth/v1/admin/users/:id` with `{ password }` using `SUPABASE_SECRET_KEY` (server-side only). Ensure `email_match`: only operate on the account whose email === `invitation.email`. Do NOT flip invitation status here (accept flips it) — but ensure this endpoint cannot be replayed after acceptance (it checks `pending`).
  - Rate-limit by token+IP (lightweight in-memory limiter is acceptable; reuse any existing limiter pattern). Never log the token or password or secret key. Use `sendError`/`sendSuccess`.

  **Must NOT do**:
  - Do NOT accept `user_id`/`email` from the request body. Do NOT expose `SUPABASE_SECRET_KEY` to the browser. Do NOT set a password on an account whose email differs from the invitation. Do NOT log secrets/tokens.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: security-critical endpoint (account-takeover oracle risk); must be bounded precisely.
  - **Skills**: [`security`, `api-design`] — secret handling + auth boundary + route conventions.
  - **Skills Evaluated but Omitted**: `data-access-conventions` (covered by api-design here).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with 5,7,8,10)
  - **Blocks**: 11,12 — **Blocked By**: 4

  **References**:
  - **Pattern References**: `src/gateway/routes/admin-invitations.ts` — `sendSupabaseInvite()` shows the `SUPABASE_URL`/`SUPABASE_SECRET_KEY` admin-call pattern (apikey + Bearer headers) to reuse for the `PUT /admin/users/:id` call; the existing accept handler's status/expiry checks to mirror.
  - **API/Type References**: GoTrue `PUT /auth/v1/admin/users/:id` body `{ password }`; `SUPABASE_SECRET_KEY()` from config.
  - **WHY (Metis R2/R3)**: This endpoint is the account-takeover risk; it MUST be gateway-proxied, token-bound, status/expiry-gated, email-matched, and never leak the secret to the browser.

  **Acceptance Criteria**:
  - [ ] Set-password succeeds (200) for a valid pending token; the targeted account's email equals the invitation email.
  - [ ] Rejects expired (410), used/non-pending (410), unknown token (404).
  - [ ] Body schema has no `email`/`user_id`; the browser never receives `SUPABASE_SECRET_KEY`.

  **QA Scenarios**:

  ```
  Scenario: Set-password on valid token, correct account (happy path)
    Tool: Bash (curl) + psql
    Preconditions: a pending invitation token from Task 5 (extract from Mailpit)
    Steps:
      1. POST http://localhost:7700/invitations/set-password -d '{"token":"<token>","password":"Test1234!"}' → assert 200.
      2. Confirm sign-in works: curl "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" -d '{"email":"<invitee>","password":"Test1234!"}' → assert 200 with access_token.
    Expected Result: password set on the invitee's account; they can authenticate.
    Evidence: .sisyphus/evidence/task-6-setpw-happy.json

  Scenario: Expired/used/unknown token rejected (negative)
    Tool: Bash (curl) + psql
    Steps:
      1. Update a test invitation's expires_at to the past; POST set-password → assert 410 EXPIRED.
      2. POST set-password with a random token → assert 404.
      3. Accept an invitation then POST set-password with its token → assert 410 (not pending).
    Expected Result: all non-pending/expired/unknown paths rejected; no password change.
    Evidence: .sisyphus/evidence/task-6-setpw-reject.txt

  Scenario: Secret key never reaches browser (security)
    Tool: Bash (grep on built bundle)
    Steps:
      1. grep -r "SUPABASE_SECRET_KEY\|sb_secret" dashboard/dist 2>/dev/null | wc -l → assert 0.
    Expected Result: no secret key in the dashboard bundle.
    Evidence: .sisyphus/evidence/task-6-no-secret.txt
  ```

  **Commit**: groups with Wave 2.

- [x] 7. Fix accept handler ordering — create user + membership for brand-new invitee

  **What to do**:
  - In `POST /invitations/accept` (`admin-invitations.ts`), fix the `USER_NOT_FOUND` deadlock so a brand-new invitee becomes a `user` + `tenant_membership`. Inside the existing `$transaction({ isolationLevel: 'Serializable' })`: after validating the invitation (pending + not expired), resolve the `users` row by `invitation.email`; **if absent, create it** — keyed by the Supabase identity for that email. To get `supabase_id`, look it up by querying `auth.users` for `invitation.email` (the account was created in Task 5), OR accept an authenticated session on this call (the acceptance page signs the user in first, so `ensureUserExists` may already have created the row). Prefer: if `req.auth` is present and its email matches the invitation, use `req.auth.id`; else create/find the `users` row by the invitation email + the `auth.users.id`. Then create the `tenant_membership` with `invitation.role`, flip invitation → `accepted` (set `accepted_at`). Keep idempotency: existing membership → 409 `ALREADY_MEMBER`.
  - Keep tenant-scoping and soft-delete filters intact. Do NOT change decline/revoke.

  **Must NOT do**:
  - Do NOT remove the Serializable transaction. Do NOT create a membership for an invitation that is not `pending`. Do NOT "fix" the DECLINE/REVOKE error-code inconsistency. Do NOT alter `ensure-user-exists.ts` behavior beyond what's strictly needed (prefer fixing inside the accept handler).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: transactional correctness + identity resolution; the core data-integrity fix.
  - **Skills**: [`api-design`, `data-access-conventions`, `prisma`] — transaction/route conventions, DB access, schema/soft-delete rules.
  - **Skills Evaluated but Omitted**: `security` (the accept path is token-gated already; set-password handles secrets).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with 5,6,8,10)
  - **Blocks**: 11,12 — **Blocked By**: 4

  **References**:
  - **Pattern References**: `src/gateway/routes/admin-invitations.ts:163-242` — current accept handler + its Serializable transaction; `src/gateway/services/ensure-user-exists.ts:6-30` — how a `users` row is upserted (keyed on `supabase_id`, role 'USER', status 'active') — mirror these fields when creating inline.
  - **API/Type References**: `User` model (supabase_id unique nullable, email unique), `TenantMembership` composite PK `[tenant_id,user_id]`, `TenantInvitation` status flow.
  - **WHY (Metis)**: This removes the chicken-and-egg `USER_NOT_FOUND` failure so a brand-new invitee actually gets a membership.

  **Acceptance Criteria**:
  - [ ] Accepting with a brand-new invitee creates exactly one `users` row + one `tenant_memberships` row with the invited role (psql; zero rows = failure) and flips the invitation to `accepted`.
  - [ ] Accepting twice → second call 409/410, no duplicate membership.

  **QA Scenarios**:

  ```
  Scenario: Brand-new invitee gets membership (happy path)
    Tool: Bash (curl) + psql
    Preconditions: invitation created (Task 5) + password set (Task 6) + invitee signed in to obtain session if required
    Steps:
      1. POST http://localhost:7700/invitations/accept -d '{"token":"<token>"}' → assert 200/201.
      2. psql … -c "SELECT role FROM tenant_memberships WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND user_id=(SELECT id FROM users WHERE email='<invitee>');" → assert exactly 1 row = MEMBER.
      3. psql … -c "SELECT status, accepted_at IS NOT NULL FROM tenant_invitations WHERE token='<token>';" → accepted, true.
    Expected Result: membership created, invitation accepted.
    Failure Indicators: zero membership rows, USER_NOT_FOUND, status still pending.
    Evidence: .sisyphus/evidence/task-7-accept-happy.json

  Scenario: Double-accept is idempotent (negative)
    Tool: Bash (curl)
    Steps:
      1. Accept the same token twice; second → 410/409; psql confirms still exactly 1 membership row.
    Expected Result: no duplicate membership.
    Evidence: .sisyphus/evidence/task-7-double-accept.txt
  ```

  **Commit**: groups with Wave 2.

- [x] 8. getInvitationByToken read endpoint (new-vs-existing user hint)

  **What to do**:
  - Add a public read endpoint `GET /invitations/:token` (or `/invitations/lookup?token=…` — pick one and keep Task 9 consistent) that returns safe, non-sensitive fields for the acceptance page: `{ email, organizationName, role, status, expiresAt, isExistingUser }`. Reject unknown token (404). `isExistingUser` = whether a confirmed Supabase account already exists for `invitation.email` with a usable password (i.e. created BEFORE this invite / already a real user) — used by the page to choose set-password vs log-in. A simple, robust signal: `true` if a `users` row already exists for that email (they've signed in before), else `false`.
  - Do NOT return the token back, any password, or internal IDs beyond what the page needs. Use `sendSuccess`/`sendError`. Tenant-scope the org lookup.

  **Must NOT do**:
  - Do NOT leak whether arbitrary emails have accounts beyond the scope of a valid invitation token (the endpoint requires a valid token first). Do NOT return secrets/tokens.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: small endpoint but needs careful info-disclosure boundaries.
  - **Skills**: [`api-design`, `security`] — response shaping + info-disclosure care.
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with 5,6,7,10)
  - **Blocks**: 10,12 — **Blocked By**: 4

  **References**:
  - **Pattern References**: `src/gateway/routes/admin-invitations.ts` (existing routes + `sendSuccess`/`sendError`); `src/gateway/routes/admin-reads.ts:400` (GET invitations list — response-shaping style).
  - **WHY**: The acceptance page needs org name, role, and the new-vs-existing-user signal to render the correct branch without exposing sensitive data.

  **Acceptance Criteria**:
  - [ ] `GET /invitations/:token` for a valid pending token returns `{ email, organizationName, role, status, expiresAt, isExistingUser }`; unknown token → 404.
  - [ ] Response never includes the token, a password, or `SUPABASE_SECRET_KEY`.

  **QA Scenarios**:

  ```
  Scenario: Lookup returns org + role + existing-user hint (happy path)
    Tool: Bash (curl)
    Preconditions: a valid pending token (Task 5)
    Steps:
      1. curl -s http://localhost:7700/invitations/<token> | jq → assert fields email, organizationName, role, status=="pending", expiresAt, isExistingUser present.
      2. Assert response has NO "token" field.
    Expected Result: page-ready data, no sensitive leakage.
    Evidence: .sisyphus/evidence/task-8-lookup.json

  Scenario: Unknown token 404 (negative)
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/invitations/deadbeef → assert 404.
    Expected Result: unknown tokens rejected.
    Evidence: .sisyphus/evidence/task-8-unknown.txt
  ```

  **Commit**: groups with Wave 2.

- [x] 10. AcceptInvitePage.tsx + public route in App.tsx

  **What to do**:
  - Add a PUBLIC route `/dashboard/accept-invite` in `dashboard/src/App.tsx` OUTSIDE `<ProtectedRoute>` (alongside login/signup/forgot-password). Create `dashboard/src/pages/AcceptInvitePage.tsx`.
  - Page flow: read `?token=` from the URL (`useSearchParams`). Call `getInvitationByToken(token)`. Handle states: invalid/expired/used → friendly message + link to login. If `isExistingUser === false` (new user) → show a **set-password** form (password + confirm), call `setInvitationPassword(token, password)`, then sign the user in (`supabase.auth.signInWithPassword({ email, password })`), then call `acceptInvitation(token)`, then redirect to `/dashboard/?tenant=<tenantId>`. If `isExistingUser === true` → show a **"Log in to accept"** prompt; after the user signs in (reuse existing login UX / link to `/dashboard/login` preserving the token, OR an inline password field), call `acceptInvitation(token)` then redirect. Provide a Decline button → `declineInvitation(token)`.
  - Use the existing auth-page layout + card-shell styling (`rounded-lg border bg-card`, `px-5 py-4`), `SearchableSelect` not needed here. Plain non-technical copy ("Accept your invitation", "Set your password", "Organization"). Keep navigatable state in the URL.
  - Do NOT reimplement magic-link/PKCE handling — `AuthCallbackPage` owns that; this page is token-driven only.

  **Must NOT do**:
  - Do NOT put the route inside `ProtectedRoute`. Do NOT call the Supabase admin API from the browser (use the gateway set-password endpoint). Do NOT duplicate `AuthCallbackPage` logic. Do NOT use Radix `<Select>` (use `SearchableSelect` if any dropdown is needed — none expected here).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: new user-facing page with branching auth UX and styling conventions.
  - **Skills**: [`react-dashboard`] — SearchableSelect/card-shell/URL-state/non-technical-copy conventions.
  - **Skills Evaluated but Omitted**: `slack-conventions` — not Slack.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with 5,6,7,8)
  - **Blocks**: 12 — **Blocked By**: 8,9

  **References**:
  - **Pattern References**: `dashboard/src/pages/LoginPage.tsx` + `SignupPage.tsx` — auth-page layout, form handling, `supabase.auth.signInWithPassword`/`signUp`, toast usage; `dashboard/src/App.tsx:71-107` — where public routes are declared (add the new one here, outside ProtectedRoute); `dashboard/src/pages/AuthCallbackPage.tsx` — DO NOT duplicate; understand the boundary only.
  - **API/Type References**: the Task 9 client fns (`getInvitationByToken`, `setInvitationPassword`, `acceptInvitation`, `declineInvitation`).
  - **External References**: AGENTS.md dashboard conventions — card shells, URL-encoded state, non-technical end-user language.
  - **WHY**: Reuse the existing auth-page look and the established public-route pattern; the page is the only place the platform token is consumed.

  **Acceptance Criteria**:
  - [ ] Visiting `/dashboard/accept-invite?token=<valid>` renders org name + role; new user sees set-password, existing user sees log-in.
  - [ ] Completing the new-user flow signs in and lands on the dashboard with a membership created.
  - [ ] `pnpm dashboard:build` compiles; route is public (reachable while logged out).

  **QA Scenarios**:

  ```
  Scenario: New-user accept end-to-end via UI (happy path)
    Tool: Playwright (playwright skill) at http://localhost:7700/dashboard/
    Preconditions: a fresh invitation token (Task 5) for qa-invitee-<ts>@dozaldevs.com (new user)
    Steps:
      1. page.goto('http://localhost:7700/dashboard/accept-invite?token=<token>')
      2. Assert visible org name (e.g. "VLRE") and role ("Member").
      3. Fill password field '#password' = "Test1234!" and confirm '#confirm-password' = "Test1234!"; click button text "Accept" / "Set password".
      4. Wait for navigation to a /dashboard/ URL (signed in).
      5. Screenshot to evidence.
      6. psql … assert tenant_memberships row exists for the invitee with role MEMBER.
    Expected Result: invitee sets password, is signed in, membership created.
    Failure Indicators: stuck on accept page, error toast, zero membership rows.
    Evidence: .sisyphus/evidence/task-10-newuser-ui.png

  Scenario: Invalid/expired token shows friendly error (negative)
    Tool: Playwright
    Steps:
      1. goto accept-invite?token=deadbeef → assert an error message + a link/button to log in is shown (no crash, no blank page).
    Expected Result: graceful invalid-token UX.
    Evidence: .sisyphus/evidence/task-10-invalid-token.png

  Scenario: Public route reachable while logged out (security/routing)
    Tool: Playwright (fresh context, no session)
    Steps:
      1. In a clean context (no localStorage token), goto accept-invite?token=<valid> → assert the page renders (NOT redirected to /dashboard/login).
    Expected Result: route is outside ProtectedRoute.
    Evidence: .sisyphus/evidence/task-10-public-route.png
  ```

  **Commit**: groups with Wave 2.

- [x] 11. Vitest unit tests (EmailProvider factory, template, role-cap, accept/set-password)

  **What to do**:
  - Add `tests/unit/` specs: (a) `createEmailProvider()` returns `SmtpEmailProvider` when `RESEND_API_KEY` empty and `ResendEmailProvider` when set (mock the `resend` SDK + nodemailer — no live send). (b) `buildInvitationEmail()` produces subject/html/text containing the accept URL and no jargon. (c) role-cap helper: ADMIN cannot mint OWNER, OWNER can, PLATFORM_OWNER/SERVICE_TOKEN bypass. (d) accept-handler logic: brand-new invitee path creates membership; expired/used/revoked rejected (mock Prisma/tx). (e) set-password handler: rejects extra `email`/`user_id`, expired/used token (mock the Supabase admin call).
  - Follow existing test conventions; mock external SDKs/HTTP. Keep `pnpm test:unit` green.

  **Must NOT do**:
  - Do NOT make live network calls to Resend or Supabase in unit tests. Do NOT modify the pre-existing skipped tests (`container-boot.test.ts`).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: several focused unit tests with mocking across modules.
  - **Skills**: [`api-design`] — handler/validation conventions; mirror existing test patterns.
  - **Skills Evaluated but Omitted**: `e2e-testing` — live E2E is the Final Wave's F3, not these unit tests.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 3 (with 12)
  - **Blocks**: F\* — **Blocked By**: 5,6,7

  **References**:
  - **Test References**: existing specs under `tests/unit/` — assertion style, Vitest `vi.mock` usage for SDKs; `tests/helpers/` for shared utilities.
  - **WHY**: Tests-after coverage for the auth-adjacent logic; mocking keeps them fast and deterministic.

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit` passes including the new specs (0 failures; pre-existing skips unchanged).
  - [ ] Factory, template, role-cap, accept, and set-password each have at least one happy + one negative test.

  **QA Scenarios**:

  ```
  Scenario: New unit tests pass (happy path)
    Tool: Bash
    Steps:
      1. pnpm test:unit 2>&1 | tee /tmp/t11.txt → assert "0 failed" / all pass.
      2. grep -E "email-provider|invitation|role-cap|accept|set-password" /tmp/t11.txt → assert new specs ran.
    Expected Result: green suite incl. new tests.
    Evidence: .sisyphus/evidence/task-11-unit.txt

  Scenario: Tests use mocks, no live calls (negative/isolation)
    Tool: Bash (grep)
    Steps:
      1. grep -rE "vi.mock\('resend'|vi.mock\(\"resend\"|mock.*nodemailer" tests/unit → assert SDKs are mocked.
    Expected Result: no live Resend/SMTP/Supabase calls in unit tests.
    Evidence: .sisyphus/evidence/task-11-mocks.txt
  ```

  **Commit**: groups with Wave 3.

- [x] 12. Docs — AGENTS.md + README.md + user-auth-rbac guide

  **What to do**:
  - Update `docs/guides/2026-06-09-1448-user-auth-rbac.md` with the working invitation flow: invite → custom email (Mailpit/Resend) → accept-invite page (set-password for new users / log-in for existing) → membership; the supersede semantics; the gateway-proxied set-password security model; the `email_confirm:true` rationale.
  - Update `README.md`: add the new admin/public endpoints to the endpoint table (`POST /invitations/set-password`, `GET /invitations/:token`), add the new env vars (`RESEND_API_KEY`, `EMAIL_FROM`, `DASHBOARD_BASE_URL`, `SMTP_URL`) to the env section in the mandated order, and note `src/lib/email/` in Project Structure.
  - Update `AGENTS.md`: note `src/lib/email/` EmailProvider (Mailpit local / Resend prod), the invitation flow + acceptance route, the new env vars, and the gateway-proxied set-password security rule. Keep facts durable (enumerate, no volatile counts). Note the pre-existing DECLINE-vs-REVOKE error-code inconsistency as a known issue.

  **Must NOT do**:
  - Do NOT add volatile counts (e.g. "N functions"). Do NOT reference AI tools. Do NOT document features not built.

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: documentation across three files.
  - **Skills**: [] — straightforward technical writing.
  - **Skills Evaluated but Omitted**: none.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 3 (with 11)
  - **Blocks**: F\* — **Blocked By**: 5,6,7,8,10

  **References**:
  - **Pattern References**: `README.md` endpoint table + env conventions; `AGENTS.md` Key Conventions + Documentation Durability rules; `docs/guides/2026-06-09-1448-user-auth-rbac.md` existing structure.
  - **WHY**: AGENTS.md "Documentation Freshness" mandates these updates when endpoints/env/modules are added.

  **Acceptance Criteria**:
  - [ ] All three docs updated; new endpoints + env vars documented; no volatile counts added.

  **QA Scenarios**:

  ```
  Scenario: Docs mention new endpoints + env + module (happy path)
    Tool: Bash (grep)
    Steps:
      1. grep -l "invitations/set-password\|accept-invite" README.md AGENTS.md docs/guides/2026-06-09-1448-user-auth-rbac.md → assert all three match.
      2. grep -E "RESEND_API_KEY|DASHBOARD_BASE_URL" README.md → assert present.
      3. grep "src/lib/email" AGENTS.md README.md → assert present.
    Expected Result: documentation reflects the new flow.
    Evidence: .sisyphus/evidence/task-12-docs.txt
  ```

  **Commit**: groups with Wave 3.

- [ ] 13. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**:
  - After F1–F4 APPROVE and the user gives explicit okay, run: `tsx scripts/telegram-notify.ts "✅ Org invitation flow complete — invite→email→accept→membership working end-to-end (Mailpit local / Resend prod). All tasks done. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: single command.
  - **Skills**: [] — none.

  **Parallelization**:
  - **Can Run In Parallel**: NO — **Blocked By**: F1,F2,F3,F4 + user okay

  **Acceptance Criteria**:
  - [ ] Telegram message sent (command exits 0).

  **QA Scenarios**:

  ```
  Scenario: Notification sent (happy path)
    Tool: Bash
    Steps:
      1. Run the telegram-notify command; assert exit code 0.
    Expected Result: completion notification delivered.
    Evidence: .sisyphus/evidence/task-13-notify.txt
  ```

  **Commit**: NO.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for the user's explicit approval before marking work complete.** Never mark F1–F4 checked before getting the user's okay. Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search the codebase for forbidden patterns — reject with file:line if found (especially: any edits to `DELETE/PATCH .../members`, `SUPABASE_SECRET_KEY` in browser bundle or logs, `z.string().uuid()`, token in logs). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against the plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` (tsc) + `pnpm lint` + `pnpm test:unit`. Review all changed files for `as any`/`@ts-ignore`, empty catches, `console.log` in prod paths, commented-out code, unused imports, AI slop (excessive comments, over-abstraction, generic names). Confirm EmailProvider has exactly two impls and no extra abstraction. Confirm config uses `getEnv`/lazy getters (not nonexistent `optionalEnv`).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA — live invite→accept E2E** — `unspecified-high` (+ `playwright`, `feature-verification` skills)
      Pre-flight: `curl localhost:7700/health`; confirm Mailpit reachable (`curl http://localhost:54325/api/v1/messages`); single gateway (`pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` == 1). Then from a clean state run the full happy path against VLRE `00000000-0000-0000-0000-000000000003`: invite `qa-invitee-<ts>@dozaldevs.com` (MEMBER) → assert Mailpit message + token link → open `/dashboard/accept-invite?token=…` in Playwright → set password → assert signed in → assert `tenant_memberships` row exists with role MEMBER (psql, zero rows = fail) → assert the new user can `signInWithPassword` (200, not `email_not_confirmed`). Then run failure cases: expired token (410), already-used (410), revoked (410), ADMIN-mints-OWNER (403). Re-invite supersede: invite same email twice, assert old invite `revoked`, new email sent, only the latest token works. Existing-user branch: invite `victor@dozaldevs.com` (existing Supabase user, no membership) → accept page asks for log-in (not set-password) → membership created. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Happy [PASS/FAIL] | Failure cases [N/N] | Supersede [PASS/FAIL] | Existing-user [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec. Confirm `MUST NOT` compliance: no member removal/deactivation/role-change code touched, no `AuthCallbackPage` re-implementation, no DECLINE/REVOKE error-code "fix", no extra abstractions. Detect cross-task contamination and unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(email): add provider-abstracted EmailService (Mailpit/Resend) + config + schemas` — `src/lib/email/**`, `src/lib/config.ts`, `.env*`, `src/gateway/validation/schemas.ts`, `dashboard/src/lib/gateway.ts`; pre-commit `pnpm lint`
- **Wave 2**: `feat(invitations): working invite→email→accept flow with set-password + role cap` — `src/gateway/routes/admin-invitations.ts`, `dashboard/src/pages/AcceptInvitePage.tsx`, `dashboard/src/App.tsx`; pre-commit `pnpm build && pnpm lint`
- **Wave 3**: `test(invitations): unit tests` + `docs: document invitation flow` — `tests/unit/**`, `AGENTS.md`, `README.md`, `docs/guides/2026-06-09-1448-user-auth-rbac.md`; pre-commit `pnpm test:unit`

---

## Success Criteria

### Verification Commands

```bash
pnpm build      # Expected: tsc success, 0 errors
pnpm lint       # Expected: 0 errors
pnpm test:unit  # Expected: all pass (new email/invitation tests included)
curl -s http://localhost:54325/api/v1/messages | jq '.total'   # Expected: >0 after an invite
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role FROM tenant_memberships WHERE user_id=(SELECT id FROM users WHERE email='<qa-invitee>');"  # Expected: 1 row, invited role
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass; build + lint clean
- [ ] F1–F4 APPROVE and user gave explicit okay
- [ ] Docs updated; draft deleted; Telegram notification sent
