# Learnings — Google OAuth Integration

## [2026-06-03] Session Start

### Codebase Patterns

- OAuth template: `src/gateway/routes/notion-oauth.ts` (standard code→token exchange)
- Token manager template: `src/gateway/services/github-token-manager.ts`
- Route mounting: `app.use('/integrations', googleOAuthRoutes({ prisma }))` in `server.ts`
- Shell tools use raw `fetch()` — NO `googleapis` in worker containers
- Internal token endpoint mirrors GitHub: `POST /internal/tasks/:taskId/google-token` with `X-Task-ID` auth
- Token storage: `TenantSecretRepository.set()` → AES-256-GCM encrypted in `tenant_secrets`
- Integration tracking: `TenantIntegrationRepository.upsert(tenantId, provider, { external_id })`
- Conflict detection: `integrationRepo.findByExternalId()` prevents same account on two tenants

### Google API Constants

- Auth URL: `https://accounts.google.com/o/oauth2/v2/auth`
- Token URL: `https://oauth2.googleapis.com/token`
- Userinfo URL: `https://www.googleapis.com/oauth2/v3/userinfo`
- Revoke URL: `https://oauth2.googleapis.com/revoke`

### 5 Tenant Secrets

- `google_access_token` — short-lived (1hr)
- `google_refresh_token` — permanent (never overwrite on tokens event — MERGE only)
- `google_token_expiry` — ISO timestamp for proactive refresh
- `google_user_email` — display only
- `google_granted_scopes` — space-separated, for scope denial detection

### 8 OAuth Scopes

```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/documents
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/presentations
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

### Error Codes from Internal Endpoint

- `google_not_connected` → 404
- `google_reauth_required` → 401
- `google_workspace_session_expired` → 401

### Key Constraints

- `prompt: 'consent'` AND `access_type: 'offline'` mandatory in every auth URL
- Use Google `sub` (permanent numeric ID) as `external_id` — NOT email
- `forceRefreshOnFailure: true` on all OAuth2Client instances
- `approval_required: true` on Google Assistant archetype
- VLRE tenant: `00000000-0000-0000-0000-000000000003`
