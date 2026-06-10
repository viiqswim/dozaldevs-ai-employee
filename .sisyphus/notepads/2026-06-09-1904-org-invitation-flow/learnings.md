# Learnings — org-invitation-flow

## [2026-06-09] Initial Context

### config.ts patterns

- Uses `getEnv(name, default)` for optional env vars with defaults
- Uses `requireEnv(name)` for required vars (throws if missing)
- Lazy arrow getters: `export const X = (): string => process.env.X ?? 'default'`
- `optionalEnv` does NOT exist in config.ts — only in worker-tools/
- File ends at line 101 — add new getters after the Notion section

### .env section order (mandatory)

1. Database, 2. Supabase, 3. Platform Core, 4. Inngest, 5. Worker Dispatch Mode,
2. Render (production), 7. Fly.io, 8. AI/OpenRouter, 9. GitHub, 10. Google,
3. Slack Integration, 12. Notion OAuth, 13. Webhooks, 14. Telegram

- NEW "Email" section goes BETWEEN Slack (11) and Notion (12) — or between Notion (12) and Webhooks (13)
- Actually: Slack=11, Notion=12, Webhooks=13, Telegram=14 — Email goes between Slack and Notion (new section 12, shift others)
- Wait: README says section 9=Slack, 10=Webhooks. But .env has Slack, Notion, Webhooks, Telegram.
- README section order: 9=Slack, 10=Webhooks, 11=Telegram, 12=Cost Control, 13=TENANT SECRETS, 14=DEPRECATED
- Plan says: "Email section between section 9 (Slack) and section 10 (Webhooks)"
- So Email goes AFTER Slack and BEFORE Webhooks in .env

### admin-invitations.ts current state

- `sendSupabaseInvite()` uses `email_confirm: false, invite: true` — BROKEN (no-op)
- Create handler: no `inviter_id`, no supersede, no role cap, no custom email
- Accept handler: throws USER_NOT_FOUND for brand-new invitees — BROKEN
- Decline handler: works correctly
- Revoke handler: works correctly
- File is 312 lines

### schemas.ts

- `UUID_REGEX` and `uuidField()` exported at line 163-165
- Never use `z.string().uuid()` — use `uuidField()` for UUID fields
- TenantRole enum from `@prisma/client`: OWNER, ADMIN, MEMBER, VIEWER

### dashboard/src/lib/gateway.ts

- `gatewayFetch<T>(path, options)` — auto-attaches Bearer token from localStorage if present
- Token-only public endpoints: just call `gatewayFetch` without forcing auth header (it only adds if token exists)
- Existing invitation fns: `inviteMember`, `listInvitations`, `revokeInvitation`
- File is 487 lines

### Supabase admin API

- Create user: `POST {SUPABASE_URL}/auth/v1/admin/users` with `{ email, email_confirm: true }`
- Set password: `PUT {SUPABASE_URL}/auth/v1/admin/users/:id` with `{ password }`
- Headers: `apikey: SUPABASE_SECRET_KEY`, `Authorization: Bearer SUPABASE_SECRET_KEY`
- SUPABASE_URL locally = `http://localhost:54331`

### Email infrastructure

- Mailpit: SMTP `localhost:54324`, web UI `localhost:54325`
- Container: `shared-mailpit`
- No existing email code in src/

### Role rank order

- OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)
- ADMIN cannot mint OWNER invites
- PLATFORM_OWNER and SERVICE_TOKEN bypass the cap

### Critical fixes

- `email_confirm: true` is MANDATORY (not false) — otherwise signInWithPassword returns email_not_confirmed
- `inviter_id` must be set from `req.auth?.id ?? null`
- Supersede: revoke prior pending invite for same (tenant_id, email) before creating new one
- Accept handler: create `users` row inline if not found (don't throw USER_NOT_FOUND)

## Task 1 — Email env vars in config.ts

- `config.ts` lazy getter style: `export const X = (): string => process.env.X ?? 'default'`
- Multi-line getters use `process.env.X ?? \`fallback\`` on the next line (see DASHBOARD_BASE_URL, SMTP_URL)
- `.env` Email section inserted between Slack and Notion OAuth (lines 88→90)
- `.env.example` Email section inserted in same position with description comments per var
- tsx -e inline eval requires `.ts` extension (not `.js`) for source imports
- Build: `pnpm build` = `tsc -p tsconfig.build.json`, exits 0 on success with no output

## [2026-06-09] Task 2 — Email module (src/lib/email/)

### Config getters already existed
- `RESEND_API_KEY`, `EMAIL_FROM`, `SMTP_URL`, `DASHBOARD_BASE_URL` already in config.ts (lines 104-109) — T1 ran first. No fallback needed.

### Resend SDK v6.12.4 API shape (verified from node_modules README + types)
- `new Resend(apiKey)` then `client.emails.send({ from, to, subject, html, text, replyTo })`
- Uses camelCase `replyTo` (NOT snake_case `reply_to`)
- Returns `{ data: { id } | null, error: { name, message } | null }`
- types entry is `dist/index.d.mts` (.mts extension — glob for *.d.ts misses it)
- `text` is required-ish in the typed union; pass `text: options.text ?? ''` to satisfy CreateEmailOptions overload

### nodemailer v8
- `import { createTransport, type Transporter } from 'nodemailer'`
- `createTransport(smtpUrl)` accepts connection-string URL directly
- `transporter.sendMail({...})` returns `info.messageId`

### QA gotcha — tsx eval mode can't remap .js→.ts
- `pnpm exec tsx -e "import './src/lib/email/index.js'"` FAILS: "Cannot find module" — the [eval] require stack doesn't go through tsx's extension remapper
- FIX: write a real temp .ts file that imports '../../src/lib/email/index.js' and run `tsx file.ts` — extension remap works for real files
- python3 unavailable (asdf no version set) — use `node -e` for JSON parsing in QA

### Verification results
- Factory: no RESEND_API_KEY → SmtpEmailProvider ✓; RESEND_API_KEY=re_test → ResendEmailProvider ✓
- SMTP→Mailpit (localhost:54324): message delivered, 1 matching probe message in Mailpit ✓
- pnpm build: EXIT_CODE 0 ✓

## [2026-06-09] T11 — Vitest unit tests for invitation flow

### Files created/modified
- NEW `tests/unit/lib/email-provider.test.ts` — 3 tests: factory SMTP vs Resend selection
- NEW `tests/unit/lib/invitation-template.test.ts` — 9 tests: buildInvitationEmail
- EXTENDED `tests/unit/gateway/routes/admin-invitations.test.ts` — +8 tests: set-password handler

### EmailProvider factory test pattern (the tricky one)
- Must mock `resend` AND `nodemailer` at module level — constructing either provider
  instantiates the SDK client (`new Resend()` / `createTransport()`), which would otherwise
  try real connections. Mock returns a stub with the right method shape.
- Use `vi.hoisted(() => ({ resendApiKey: '' }))` for mutable mock state, because vi.mock
  factories are hoisted above imports — a plain `let` is in the TDZ when the factory runs.
  Mutate `mockState.resendApiKey` per-test to flip factory branch.
- Assert via `toBeInstanceOf(ResendEmailProvider)` / `SmtpEmailProvider` — import the real
  classes (they're cheap; only the SDK clients are mocked).
- Also assert the constructor spy args: `createTransportMock` called with SMTP_URL,
  `resendConstructor` called with the api key.

### set-password handler test (in admin-invitations.test.ts)
- Handler flow: Zod safeParse → `tenantInvitation.findFirst` (via makeApp override) →
  status/expiry guards → `getSupabaseUserIdByEmail` (GET fetch) → PUT fetch to set password.
- Existing `makeApp({ invitationFindFirst })` override + global `mockFetch` covers everything.
- For 200 path: `mockFetch.mockResolvedValueOnce(GET users)` then `.mockResolvedValueOnce(PUT ok)`.
  Assert `mockFetch.mock.calls[1]` is the PUT with `body: JSON.stringify({ password })`.
- Guard cases (404/410 unknown/expired/accepted/revoked) return BEFORE any fetch —
  assert `expect(mockFetch).not.toHaveBeenCalled()`.
- Zod 400s: error code is `INVALID_INPUT` (handler maps safeParse failure to that literal),
  covers missing token, missing password, password < 8 chars.

### Verification
- All 3 files: 50/50 tests pass.
- Full `pnpm test:unit`: 1360 passed, 9 skipped, 1 failed.
- The 1 failure is `socket-mode-lock.test.ts > blocked-live` — FLAKY, unrelated. Passes 6/6
  in isolation. It spawns a real gateway process to test lock contention; fails only under
  parallel suite load (process/timing race). NOT caused by these changes.
