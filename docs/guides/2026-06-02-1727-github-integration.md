# GitHub Integration Guide

This document describes how the GitHub App integration works end-to-end — from installation through token generation through how engineer employees authenticate with GitHub inside their containers.

---

## Overview

The integration has four distinct concerns:

| Concern                            | Where it lives                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| App installation (OAuth)           | `src/gateway/routes/github-oauth.ts`                                                   |
| Webhook lifecycle (uninstall)      | `src/gateway/routes/github.ts`                                                         |
| Token generation (JWT → API token) | `src/gateway/services/github-token-manager.ts`                                         |
| Token delivery to workers          | `src/gateway/routes/internal-github-token.ts` + `src/worker-tools/github/get-token.ts` |

One GitHub App per environment is deployed — a separate App for local development and another for production. Each tenant installs the App for the environment they're connecting to; the App name is configured via `GITHUB_APP_NAME` in `.env`. Tokens are scoped per installation, so tenant A cannot access tenant B's repos.

---

## 1. Installation Flow (Connect GitHub)

### How the user installs

1. User clicks "Connect GitHub" in the dashboard Integrations page
2. Dashboard navigates to `GET /integrations/github/install?tenant=<slug>`
3. Gateway generates a **signed state** and redirects to GitHub's installation page:
   ```
   https://github.com/apps/<GITHUB_APP_NAME>/installations/new?state=<signed>
   ```
4. User installs the app on GitHub, selects which repos to grant access
5. GitHub redirects to the gateway's **Setup URL** with the installation ID:
   ```
   GET /integrations?installation_id=<id>&setup_action=install&state=<signed>
   ```
6. A fallback handler at `GET /integrations` detects the GitHub params and redirects to the real callback:
   ```
   GET /integrations/github/callback?installation_id=<id>&setup_action=install&state=<signed>
   ```
7. Callback verifies the HMAC-signed state, extracts the tenant ID, and stores the installation ID:
   - `tenant_secrets` ← `github_installation_id = <id>` (AES-256-GCM encrypted)
   - `tenant_integrations` ← `provider = 'github', status = 'active', external_id = <id>`
8. User is redirected to `/dashboard/integrations?tenant=<id>&connected=github`

### Signed state (CSRF prevention)

`src/gateway/lib/oauth-state.ts` implements a simple HMAC state:

```
state = base64url(payload) + "." + HMAC-SHA256(base64url(payload), ENCRYPTION_KEY)
```

The payload carries `{ tenant_id, nonce }`. Verification uses timing-safe comparison. There is no expiry — the nonce exists to prevent state reuse if the same payload were generated twice (though the gateway does not currently enforce single-use).

### Setup URL mismatch (known gotcha)

GitHub App settings only allow one Setup URL. The current setting points to `/integrations` (bare path), but the actual handler is at `/integrations/github/callback`. The fallback handler at `GET /integrations` bridges this gap automatically — it detects `installation_id` + `state` query params and 302-redirects to the correct path. If the Setup URL is updated to `/integrations/github/callback` directly, the fallback becomes a no-op (harmless).

---

## 2. Token Generation

### How it works

GitHub App authentication uses two token types in sequence:

```
App Private Key (RSA)
    ↓  RS256 JWT (10-minute TTL)
GitHub API /app/installations/<id>/access_tokens
    ↓  Installation Token (60-minute TTL, scoped to repos)
```

`src/gateway/services/github-token-manager.ts` handles this:

1. Signs a JWT using the app's RSA private key (`GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY`)
2. Calls GitHub's REST API to exchange the JWT for an installation access token
3. Caches the token in-memory for **55 minutes** (5-minute buffer before expiry)

### Private key format (important)

`GITHUB_PRIVATE_KEY` is stored in `.env` with literal `\n` characters (backslash-n), not real newlines. Node's `process.env` does NOT expand these. The token manager normalizes them before passing to `crypto.createSign`:

```typescript
const normalizedKey = privateKey.replace(/\\n/g, '\n');
```

Without this, Node throws `ERR_OSSL_UNSUPPORTED`. If you rotate the private key, the same normalization must be applied.

### Token cache

The in-memory cache is keyed by `installation_id`. On gateway restart, the cache clears and the next call regenerates. The 55-minute TTL prevents races at token expiry.

---

## 3. Uninstall Cleanup (Webhook)

When a user uninstalls the GitHub App from their GitHub settings, GitHub sends a webhook:

```
POST /webhooks/github
X-GitHub-Event: installation
body: { action: "deleted", installation: { id: <id> } }
```

The handler at `src/gateway/routes/github.ts`:

1. Verifies the `X-Hub-Signature-256` HMAC (uses `GITHUB_WEBHOOK_SECRET`)
2. Ignores all non-`installation` events (returns 200 no-op)
3. For `action: "deleted"`:
   - Looks up the tenant by `installation_id` via `tenant_integrations.external_id`
   - Soft-deletes the `tenant_integrations` row (`deleted_at` set)
   - Deletes the `github_installation_id` secret from `tenant_secrets`
4. For `action: "created"`: no-op — tenant association is handled by the Setup URL callback, which carries the signed state that maps the installation to a tenant. The webhook payload does not carry tenant context.

**Note:** If `GITHUB_WEBHOOK_SECRET` is not configured, the webhook endpoint returns 401 and rejects all payloads.

---

## 4. Repo Listing (Dashboard Wizard)

The wizard uses the repo list to let users pick which repository the engineer employee should work on.

```
GET /admin/tenants/:tenantId/github/repos
X-Admin-Key: <key>
```

Implementation (`src/gateway/routes/admin-github.ts`):

1. Reads `github_installation_id` from `tenant_secrets`
2. Calls `generateInstallationToken()` to get a short-lived token
3. Paginates `GET https://api.github.com/installation/repositories` (100 per page)
4. Returns `{ repos: [{ full_name, html_url, default_branch, private }] }`

If the installation ID is missing or invalid, returns `{ error: "GitHub not connected" }` or `{ error: "Failed to authenticate with GitHub" }` respectively.

---

## 5. Engineer Employees — Token Delivery to Workers

Engineer employees need GitHub tokens to clone repos, push branches, and create PRs. They cannot use the admin API key (not available in containers). Instead:

### Internal token endpoint

```
POST /internal/tasks/:taskId/github-token
X-Task-ID: <taskId>
```

This endpoint (`src/gateway/routes/internal-github-token.ts`):

1. Validates `X-Task-ID` header matches the URL param
2. Fetches the task from DB — requires `status = 'Executing'` (403 otherwise)
3. Looks up the tenant's `github_installation_id`
4. Returns a fresh installation token: `{ token: "ghs_...", expires_at: "..." }`

**Security**: Only a container running an active task can fetch a token. The `TASK_ID` env var is injected by the lifecycle into every container — it is not a secret, but the task must be in `Executing` state. A task that has already completed cannot fetch new tokens.

### Shell tool: `get-token.ts`

`src/worker-tools/github/get-token.ts` (mounted at `/tools/github/get-token.ts` in containers):

```bash
tsx /tools/github/get-token.ts
```

- Reads `TASK_ID` and `GATEWAY_URL` from environment
- Calls `POST /internal/tasks/<taskId>/github-token`
- Writes the token to stdout (JSON) and to `/tmp/github-token` for shell use

**Usage inside containers:**

```bash
# Get token
tsx /tools/github/get-token.ts

# Clone a private repo
git clone https://x-access-token:$(cat /tmp/github-token)@github.com/org/repo /tmp/workspace

# Push a branch
cd /tmp/workspace
git push https://x-access-token:$(cat /tmp/github-token)@github.com/org/repo HEAD:my-branch
```

---

## 6. Archetype Generator — Code-Writing Detection

The wizard's archetype generator (`src/gateway/services/archetype-generator.ts`) auto-detects whether a description is a code-writing employee. Detection uses keyword matching (`isCodeWritingEmployee()`) on phrases like "code", "pull request", "github", "repository", "bug fix", "implement feature", etc.

When detected, the generator enforces these fields:

| Field                          | Value                                                           |
| ------------------------------ | --------------------------------------------------------------- |
| `concurrency_limit`            | `1` (never run two code jobs in parallel for same employee)     |
| `vm_size`                      | `"performance-1x"` (OpenCode binary needs ~74GB virtual memory) |
| `platform_rules_override`      | Code-writing rules (see below)                                  |
| `worker_env.GITHUB_REPO_URL`   | `""` (user fills in via wizard)                                 |
| `risk_model.approval_required` | `true` (PRs always need human review before merge)              |
| `tool_registry.tools`          | `/tools/github/get-token.ts` added                              |

**If the description does NOT involve code writing, none of these fields are set.**

### `platform_rules_override`

By default, every employee's AGENTS.md contains:

```
NEVER modify files outside /tools/. Your workspace is /tools/ only.
```

This prevents employees from accidentally modifying the host filesystem. For code employees this rule must be replaced — they need to write to `/tmp/workspace/`.

The override value:

```
You are authorized to read and write files anywhere in /tmp/workspace/. This is a code-writing
employee. Your workspace IS /tmp/workspace/. The restriction about not modifying files outside
/tools/ does NOT apply to you.
```

`src/workers/lib/agents-md-compiler.mts` checks `platformRulesOverride` when compiling the AGENTS.md:

- If present → replaces the default platform rule with the override text
- If absent → uses the default "NEVER modify files outside /tools/" rule

`src/workers/opencode-harness.mts` passes `archetype.platform_rules_override` to `compileAgentsMd()` in **both** the execution phase (line 960) and the delivery phase (line 730).

---

## 7. Environment Variable Injection

The lifecycle (`src/inngest/employee-lifecycle.ts`) spreads `archetype.worker_env` into the Docker container's environment at dispatch time:

```typescript
const workerEnvVars = (archetype.worker_env as Record<string, string> | null) ?? {};
const localWorkerEnv = {
  ...tenantEnv, // tenant secrets (SLACK_BOT_TOKEN, etc.)
  ...workerEnvVars, // archetype.worker_env (GITHUB_REPO_URL, etc.)
  TASK_ID: taskId,
  TENANT_ID: tenantId,
  GATEWAY_URL: '...',
  // ... platform vars
};
```

For engineer employees, `GITHUB_REPO_URL` (set by the user in the wizard) lands in the container's environment and is available to the model and bash tools.

`TASK_ID` is always injected and is what the `get-token.ts` shell tool uses to authenticate with the internal token endpoint.

---

## 8. Database Schema

| Table                 | Key columns                                                       | Purpose                               |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `tenant_secrets`      | `tenant_id, key='github_installation_id', ciphertext`             | AES-256-GCM encrypted installation ID |
| `tenant_integrations` | `tenant_id, provider='github', status, external_id`               | Integration status (active/deleted)   |
| `archetypes`          | `platform_rules_override, worker_env, vm_size, concurrency_limit` | Code-employee-specific fields         |

---

## 9. Required Environment Variables

| Variable                | Per-environment?                   | Where used                          | Notes                                                                     |
| ----------------------- | ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `GITHUB_APP_ID`         | **YES** — dev and prod differ      | Token manager                       | Numeric App ID from GitHub App settings                                   |
| `GITHUB_APP_NAME`       | **YES** — dev and prod differ      | Install route                       | App slug (e.g. `my-ai-employee-dev`)                                      |
| `GITHUB_PRIVATE_KEY`    | **YES** — each App has its own key | Token manager                       | RSA private key. Stored with literal `\n` in `.env` — normalized in code. |
| `GITHUB_WEBHOOK_SECRET` | **YES — REQUIRED**                 | Webhook handler                     | Must be set; if unset, all webhook payloads are rejected with 401.        |
| `ENCRYPTION_KEY`        | NO — shared                        | OAuth state signing, secret storage | 32+ byte random key. Not App-specific.                                    |

---

## 10. Troubleshooting

### "Failed to authenticate with GitHub" on repo listing

**Cause 1: Stale installation ID.** The GitHub App was uninstalled. Check:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status, external_id, updated_at FROM tenant_integrations WHERE provider = 'github';"
```

**Fix:** Reinstall via `GET /integrations/github/install?tenant=<slug>`.

**Cause 2: ERR_OSSL_UNSUPPORTED.** The `GITHUB_PRIVATE_KEY` value has literal `\n` that aren't being normalized. Check the gateway logs. The fix is the `.replace(/\\n/g, '\n')` in `github-token-manager.ts` (already applied).

### Redirect lands at `/integrations` with `{"error":"Not Found"}`

The GitHub App's Setup URL in settings points to `/integrations` instead of `/integrations/github/callback`. The fallback handler should catch this and redirect. If you see `{"error":"Not Found"}`, the fallback is not registered — check that `githubOAuthRoutes` is mounted at `/integrations` in `server.ts`.

**Manual workaround:** Take the URL GitHub redirected you to, change `/integrations?` to `/integrations/github/callback?`, and navigate to it in your browser. The callback will process it correctly.

### Token endpoint returns 403 in worker container

The task is not in `Executing` state. This happens if:

- The employee already finished and the delivery container is trying to fetch a new token
- A script is running outside of an active task

The token endpoint only works during task execution.

### Worker container can't reach gateway

`GATEWAY_URL` defaults to `http://localhost:7700` in the shell tool. Inside Docker containers, `localhost` refers to the container itself — the gateway is at `http://host.docker.internal:7700`. The lifecycle injects the correct `GATEWAY_URL` automatically. If you're testing the tool manually inside a container, set `GATEWAY_URL=http://host.docker.internal:7700`.

---

## 11. Multi-Environment Setup

### Why Two GitHub Apps?

GitHub Apps only allow a **single webhook URL** and a **single setup URL** per App registration. This creates a conflict when you need both local development and production to receive GitHub events and complete OAuth install flows — you can't serve both from one URL.

The solution, used by Vercel, Netlify, and Probot, is **one GitHub App per environment**:

- **Dev App** (`dozaldevs-ai-employee-dev`) — points to the Cloudflare tunnel
- **Prod App** (`dozaldevs-ai-employee`) — points to the Render deployment

Because the codebase reads all GitHub configuration from environment variables, switching environments requires only different values in `.env` — no code changes.

### Environment Configuration Reference

| Setting                 | Dev App                                                                | Prod App                                                 |
| ----------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Webhook URL             | `https://local-ai-employee.dozaldevs.com/webhooks/github`              | `https://ai-employees-laaa.onrender.com/webhooks/github` |
| Setup URL               | `https://local-ai-employee.dozaldevs.com/integrations/github/callback` | `https://ai-employees-laaa.onrender.com/integrations`    |
| `GITHUB_APP_ID`         | Dev App's numeric ID                                                   | Prod App's numeric ID                                    |
| `GITHUB_APP_NAME`       | `dozaldevs-ai-employee-dev`                                            | `dozaldevs-ai-employee`                                  |
| `GITHUB_PRIVATE_KEY`    | Dev App's private key                                                  | Prod App's private key                                   |
| `GITHUB_WEBHOOK_SECRET` | Unique secret (never share!)                                           | Unique secret (never share!)                             |
| `ENCRYPTION_KEY`        | Same in both — not App-specific                                        | Same in both — not App-specific                          |

### Setup URL Note

The dev App's Setup URL should point directly to `/integrations/github/callback` (the actual handler). The prod App's Setup URL currently points to `/integrations` (bare path) and relies on the fallback redirect handler — this works correctly and should **not** be changed.

### Security Requirement

The webhook secret **must be unique per environment**. Never copy the production webhook secret to the dev App or vice versa. A compromised development secret cannot be used to forge production webhook payloads.

### Creating the Dev App

See the GitHub App creation checklist: navigate to `https://github.com/settings/apps/new`, set the webhook URL and setup URL to the dev Cloudflare tunnel addresses, generate a new private key, set visibility to "Only on this account", and update your local `.env` with the new App ID, name, key, and webhook secret.

---

## 12. Multi-Tenant Shared Installation

Multiple organizations (tenants) can connect to the same GitHub account. GitHub App installations are 1-per-account — when a second tenant tries to install, GitHub shows "Configure" with a disabled Save button and no redirect fires.

### How It Works

The platform uses the GitHub API to detect existing installations and lets tenants link them directly:

1. **First tenant** installs the GitHub App normally via the dashboard "Connect GitHub" button
2. **Second tenant** sees available installations in the dashboard and clicks "Link"
3. Both tenants share the same `installation_id` — each gets their own `tenant_integrations` row

### API Endpoints

**List available installations** (for linking):

```bash
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT_ID/github/available-installations" | jq .
# Returns: { installations: [{ id, account: { login, type, avatar_url }, already_linked }] }
```

**Link an existing installation**:

```bash
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT_ID/github/link-installation" \
  -d '{"installation_id": "137599429"}' | jq .
# Returns: { linked: true, installation_id: "137599429" }
# NOTE: installation_id must be a string (quoted), not a number
```

**Disconnect GitHub from a tenant**:

```bash
curl -s -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT_ID/integrations/github" | jq .
# Returns: { disconnected: true, tenant_id: "..." }
# NOTE: Only removes the requesting tenant's records. Other tenants sharing the same installation are unaffected.
```

### Disconnect Behavior

- Disconnect is **tenant-scoped**: only removes the requesting tenant's `tenant_integrations` row and `github_installation_id` secret
- Does NOT call the GitHub API to uninstall the App (would break other tenants)
- Idempotent: calling disconnect twice returns 200 both times
- After disconnect, the tenant can re-link via the dashboard "Link" flow
