# Decisions — org-invitation-flow

## [2026-06-09] Architecture Decisions

- Email provider: interface + SmtpEmailProvider (nodemailer) + ResendEmailProvider (resend SDK) + factory
- Factory selection: RESEND_API_KEY non-empty → Resend; else → SMTP/Mailpit
- Set-password endpoint: gateway-proxied, token-bound, NEVER expose SUPABASE_SECRET_KEY to browser
- New-user flow: set-password → sign-in → accept
- Existing-user flow: log-in → accept (never overwrite password)
- Re-invite: supersede (revoke old, create new token, send new email)
- Decline: token-only, no auth required
- Accept: create users row inline if not found (fix USER_NOT_FOUND deadlock)
- Role cap: inviter rank must be >= invited role rank; PLATFORM_OWNER/SERVICE_TOKEN bypass
- email_confirm: true when creating Supabase auth account (platform token = verification mechanism)
- Dashboard route: PUBLIC (outside ProtectedRoute), at /dashboard/accept-invite
- Tests: tests-after (Vitest unit tests)
- Docs: update AGENTS.md + README.md + user-auth-rbac guide
- Known issue (do NOT fix): DECLINE-vs-REVOKE error-code inconsistency
