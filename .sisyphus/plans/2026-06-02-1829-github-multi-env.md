# GitHub App Multi-Environment Setup (Two-App Strategy)

## TL;DR

> **Quick Summary**: Set up two separate GitHub Apps (dev + prod) so local development and production operate independently without conflicting over GitHub's single webhook URL / setup URL constraint. This is a configuration + documentation task — zero code changes needed.
>
> **Deliverables**:
>
> - Second GitHub App created and configured for local development
> - `.env.example` updated with multi-environment documentation + dead code cleanup
> - GitHub integration guide updated to be environment-agnostic
> - AGENTS.md updated with two-App architecture documentation
>
> **Estimated Effort**: Short (1-2 hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (create App) → Task 2-4 (docs, parallel) → Task 5 (verify) → F1-F4

---

## Context

### Original Request

The user discovered that GitHub Apps only allow a single webhook URL and a single setup URL. This means local development (via Cloudflare tunnel at `local-ai-employee.dozaldevs.com`) and production (at `ai-employees-laaa.onrender.com`) cannot both receive webhooks or complete OAuth install flows simultaneously. The user asked for help investigating how other organizations handle this, and after research chose the industry-standard approach: separate GitHub Apps per environment.

### Interview Summary

**Key Discussions**:

- Researched 5 approaches: separate Apps, smee.io, programmatic URL swap, webhook fan-out, Hookdeck
- GitHub's own community response: "most people will create multiple GitHub Apps"
- Vercel, Netlify, Linear, Probot all use separate App registrations per environment
- User selected Option A: Two GitHub Apps (dev + prod) — no App Manifest automation

**Research Findings**:

- Codebase is already environment-agnostic — all GitHub config comes from env vars (`GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`)
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are dead code — listed in `.env.example` but not referenced in any active route. They were for GoTrue GitHub OAuth which was never activated.
- `PATCH /app/hook/config` can change webhook URL programmatically, but setup URL can only be changed in GitHub UI
- Token delivery to workers is already environment-aware via `GATEWAY_URL`

### Metis Review

**Identified Gaps** (addressed):

- `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` are dead code — plan includes deprecating them to prevent confusion
- Integration guide has hardcoded App name (`dozaldevs-ai-employee`) on lines 18 and 30 — plan includes making these environment-agnostic
- `GITHUB_WEBHOOK_SECRET` behavior when unset (returns 401, silently rejects all payloads) not documented clearly — plan includes adding explicit warning
- Setup URL recommendation for new App needs to be explicit — plan specifies `/integrations/github/callback` (direct path, no fallback dependency)
- Dev App ownership (personal vs org) needs to be specified — plan addresses this

---

## Work Objectives

### Core Objective

Create a second GitHub App for local development so both environments operate independently with their own credentials, webhook URLs, and setup URLs.

### Concrete Deliverables

- A new GitHub App (`dozaldevs-ai-employee-dev` or similar) configured in GitHub settings
- Updated `.env.example` with multi-environment annotations and deprecated dead code vars
- Updated `docs/guides/2026-06-02-1727-github-integration.md` with multi-environment section
- Updated `AGENTS.md` to document two-App architecture

### Definition of Done

- [ ] Two GitHub Apps exist with independent credentials
- [ ] Local dev `.env` uses dev App credentials → OAuth install flow completes successfully
- [ ] Production `.env` uses prod App credentials → no conflict with local dev
- [ ] All documentation accurately describes the two-App setup
- [ ] `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` moved to DEPRECATED section

### Must Have

- Dev App has identical permissions and events to prod App
- Dev App webhook URL points to `https://local-ai-employee.dozaldevs.com/webhooks/github`
- Dev App setup URL points to `https://local-ai-employee.dozaldevs.com/integrations/github/callback` (direct path)
- `.env.example` documents both App configurations with clear annotations
- `GITHUB_WEBHOOK_SECRET` documented as REQUIRED (not optional) with warning about 401 behavior

### Must NOT Have (Guardrails)

- NO code changes to any `.ts` files — this is configuration + documentation only
- NO changes to the production App's settings (leave its Setup URL as-is; the fallback handler works)
- NO App Manifest automation — manual GitHub UI setup only
- NO `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` duplication for dev App — they are dead code
- NO touching `docs/employees/2026-06-02-1230-engineer.md` (pre-existing `localhost:7701` bug is out of scope)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None — no code changes to test
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Config verification**: Use Bash (grep) — verify file contents match expectations
- **OAuth flow**: Use Bash (curl) — verify install redirect returns correct App URL
- **Webhook reception**: Use Bash (curl with HMAC) — verify webhook endpoint accepts payloads signed with dev secret

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — manual GitHub setup):
└── Task 1: Create dev GitHub App in GitHub settings [quick — manual browser steps documented]

Wave 2 (After Wave 1 — all docs in parallel):
├── Task 2: Update .env.example with multi-env docs + deprecate dead vars [quick]
├── Task 3: Update GitHub integration guide (environment-agnostic) [quick]
└── Task 4: Update AGENTS.md with two-App documentation [quick]

Wave 3 (After Wave 2 — verification):
└── Task 5: End-to-end verification (OAuth flow + webhook) [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
└── Task 6: Notify completion via Telegram [quick]
```

### Dependency Matrix

| Task  | Depends On | Blocks     |
| ----- | ---------- | ---------- |
| 1     | —          | 2, 3, 4, 5 |
| 2     | 1          | 5          |
| 3     | 1          | 5          |
| 4     | 1          | 5          |
| 5     | 2, 3, 4    | F1-F4      |
| F1-F4 | 5          | 6          |
| 6     | F1-F4      | —          |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **3 tasks** — T2-T4 → `quick` (all parallel)
- **Wave 3**: **1 task** — T5 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`
- **Post-final**: **1 task** — T6 → `quick`

---

## TODOs

- [x] 1. Create Dev GitHub App in GitHub Settings

  **What to do**:
  This is a manual browser task. The executing agent should guide the user through these steps and verify the output.
  1. Navigate to `https://github.com/settings/apps/new` (or `https://github.com/organizations/dozal-devs/settings/apps/new` if creating under the org)
  2. Fill in the following fields:

     | Field                         | Value                                                                  |
     | ----------------------------- | ---------------------------------------------------------------------- |
     | GitHub App name               | `dozaldevs-ai-employee-dev`                                            |
     | Homepage URL                  | `https://local-ai-employee.dozaldevs.com`                              |
     | Callback URL                  | `https://local-ai-employee.dozaldevs.com/integrations/github/callback` |
     | Setup URL (Post installation) | `https://local-ai-employee.dozaldevs.com/integrations/github/callback` |
     | Redirect on update            | ☑ checked                                                              |
     | Webhook URL                   | `https://local-ai-employee.dozaldevs.com/webhooks/github`              |
     | Webhook secret                | Generate a new random secret (different from production!)              |
     | Webhook Active                | ☑ checked                                                              |

  3. Set permissions (IDENTICAL to the production App):
     - Repository permissions: **Contents** → Read & write, **Pull requests** → Read & write, **Metadata** → Read-only
     - Subscribe to events: **Installation** (at minimum — match whatever prod App subscribes to)

  4. Set visibility: **Only on this account** (Private — dev App should not be publicly installable)

  5. After creation, record:
     - **App ID** (numeric, shown on the App settings page)
     - **App slug** (the URL-friendly name — e.g., `dozaldevs-ai-employee-dev`)
     - **Generate a private key** (download the `.pem` file)
     - **Webhook secret** (the one you entered above)

  6. Update your local `.env` file with the dev App's credentials:

     ```
     GITHUB_APP_ID="<dev-app-numeric-id>"
     GITHUB_APP_NAME="dozaldevs-ai-employee-dev"
     GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n<contents-with-literal-backslash-n>\n-----END RSA PRIVATE KEY-----"
     GITHUB_WEBHOOK_SECRET="<dev-webhook-secret>"
     ```

  7. Install the dev App on a test repository (e.g., `ai-employee-test-target`)

  **Must NOT do**:
  - Do NOT modify the production App's settings
  - Do NOT share the production webhook secret with the dev App
  - Do NOT make the dev App public

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Step-by-step instructions that the agent presents to the user; no complex logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Not relevant — this is GitHub App creation, not archetype creation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/github-oauth.ts:51-58` — The install redirect handler: shows how `GITHUB_APP_NAME` is used to construct the GitHub install URL. The dev App name must match what's set in `.env`.
  - `src/gateway/routes/github.ts:15-45` — The webhook handler: shows how `GITHUB_WEBHOOK_SECRET` is used for HMAC validation. The dev App's secret must be set here.

  **API/Type References**:
  - `src/gateway/services/github-token-manager.ts:20-35` — Shows how `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` are read. The dev App credentials go into the same env vars.

  **External References**:
  - GitHub docs: `https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app` — Official App creation guide

  **WHY Each Reference Matters**:
  - `github-oauth.ts` — Confirms the App name env var is `GITHUB_APP_NAME` and is used in the redirect URL
  - `github.ts` — Confirms webhook secret validation uses `GITHUB_WEBHOOK_SECRET` and returns 401 if unset
  - `github-token-manager.ts` — Confirms private key format requirements (literal `\n` escaping)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dev App install redirect points to correct App
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700, .env loaded with dev App credentials
    Steps:
      1. curl -s -o /dev/null -w "%{redirect_url}" "http://localhost:7700/integrations/github/install?tenant=dozaldevs"
      2. Assert redirect URL contains the dev App name (e.g., "dozaldevs-ai-employee-dev")
      3. Assert redirect URL starts with "https://github.com/apps/"
    Expected Result: Redirect URL is `https://github.com/apps/dozaldevs-ai-employee-dev/installations/new?state=...`
    Failure Indicators: URL contains the prod App name, or redirect returns 500
    Evidence: .sisyphus/evidence/task-1-install-redirect.txt

  Scenario: Dev App webhook secret validates correctly
    Tool: Bash (curl + openssl)
    Preconditions: Gateway running, GITHUB_WEBHOOK_SECRET set to dev App's secret
    Steps:
      1. PAYLOAD='{"action":"created","installation":{"id":99999}}'
      2. SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | awk '{print $2}')
      3. curl -s -w "\n%{http_code}" -X POST "http://localhost:7700/webhooks/github" -H "Content-Type: application/json" -H "X-GitHub-Event: installation" -H "X-Hub-Signature-256: sha256=$SIG" -d "$PAYLOAD"
    Expected Result: HTTP 200 (not 401 or 500)
    Failure Indicators: HTTP 401 = webhook secret mismatch; HTTP 500 = handler error
    Evidence: .sisyphus/evidence/task-1-webhook-validation.txt
  ```

  **Commit**: NO (manual GitHub UI setup — no code changes)

- [x] 2. Update `.env.example` with Multi-Environment Documentation + Deprecate Dead Vars

  **What to do**:
  1. Update the GitHub section header (currently "GitHub (Engineering Employee — Deprecated/On Hold)" on line 95) to reflect that this section is now active for the engineer employee:

     ```
     # GitHub App (Engineer Employee)
     ```

  2. Add multi-environment annotations to each GitHub App env var. Add comments explaining that these values differ between dev and prod:

     ```
     # GitHub App numeric ID — found on the GitHub App settings page.
     # Dev: dozaldevs-ai-employee-dev App ID
     # Prod: dozaldevs-ai-employee App ID
     GITHUB_APP_ID="your-app-id"
     ```

     Apply similar annotations to `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` (the webhook secret is currently in the Webhooks section at line 169).

  3. Move `GITHUB_WEBHOOK_SECRET` from the Webhooks section (line 168-169) to the GitHub App section (after `GITHUB_PRIVATE_KEY`). Add a REQUIRED warning:

     ```
     # HMAC secret for GitHub webhook validation. REQUIRED — if unset, the webhook endpoint
     # returns 401 and rejects ALL payloads, silently breaking installation cleanup.
     # Dev: generate a unique secret for the dev App (never share with prod!)
     # Prod: set in the production GitHub App's webhook settings
     GITHUB_WEBHOOK_SECRET=""
     ```

  4. Move `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (lines 106-109) to the DEPRECATED section at the bottom:

     ```
     # GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
     #   → Not used — GoTrue GitHub OAuth was never activated. The GitHub App
     #   installation flow does not use OAuth2 client credentials.
     # GITHUB_CLIENT_ID=""
     # GITHUB_CLIENT_SECRET=""
     ```

  5. Remove the old `GITHUB_TOKEN` entry (line 97-98) or move it to DEPRECATED if it's still referenced anywhere. Check first:
     ```bash
     grep -r "GITHUB_TOKEN" src/ --include="*.ts" -l
     ```
     If referenced only in deprecated engineering code, move to DEPRECATED section.

  **Must NOT do**:
  - Do NOT add separate `_DEV` suffixed env vars — the same var names are used, just with different values per environment
  - Do NOT change the section ordering (GitHub is section 8 per README convention)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit with clear before/after requirements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.env.example:94-109` — Current GitHub section with the vars to update
  - `.env.example:157-169` — Current Webhooks section where `GITHUB_WEBHOOK_SECRET` lives (must be moved)
  - `.env.example:218-236` — Current DEPRECATED section (target for `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`)
  - `README.md` § "Environment File Conventions" — Section ordering rules that must be followed

  **WHY Each Reference Matters**:
  - `.env.example:94-109` — The exact lines being modified; executor must see current format to preserve style
  - `README.md` conventions — Executor must follow section ordering rules or the change will be rejected

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET only in DEPRECATED section
    Tool: Bash (grep)
    Preconditions: .env.example has been updated
    Steps:
      1. grep -n "GITHUB_CLIENT_ID\|GITHUB_CLIENT_SECRET" .env.example
      2. Check that ALL matches appear after the "DEPRECATED" header line
      3. Verify they are commented out (prefixed with #)
    Expected Result: Both vars appear only in the DEPRECATED section, commented out
    Failure Indicators: Either var appears in an active (non-deprecated) section
    Evidence: .sisyphus/evidence/task-2-deprecated-vars.txt

  Scenario: GITHUB_WEBHOOK_SECRET in GitHub App section with REQUIRED warning
    Tool: Bash (grep)
    Preconditions: .env.example has been updated
    Steps:
      1. grep -n -A2 "GITHUB_WEBHOOK_SECRET" .env.example
      2. Verify it appears in the GitHub App section (between the GitHub header and Slack header)
      3. Verify comment contains "REQUIRED" or "required"
    Expected Result: GITHUB_WEBHOOK_SECRET is in the GitHub section with a REQUIRED annotation
    Failure Indicators: Var is still in the Webhooks section, or missing REQUIRED warning
    Evidence: .sisyphus/evidence/task-2-webhook-secret-placement.txt

  Scenario: GitHub section header updated (not deprecated)
    Tool: Bash (grep)
    Preconditions: .env.example has been updated
    Steps:
      1. grep -n "GitHub" .env.example | head -5
      2. Verify the section header does NOT contain "Deprecated" or "On Hold"
    Expected Result: Header reads "GitHub App (Engineer Employee)" or similar active title
    Failure Indicators: Header still says "Deprecated/On Hold"
    Evidence: .sisyphus/evidence/task-2-section-header.txt
  ```

  **Commit**: YES (groups with Tasks 3, 4)
  - Message: `docs(github): add multi-environment setup with two GitHub Apps`
  - Files: `.env.example`
  - Pre-commit: `pnpm lint`

- [x] 3. Update GitHub Integration Guide (Environment-Agnostic)

  **What to do**:
  1. Replace hardcoded App name on line 18:
     - FROM: `One GitHub App (\`dozaldevs-ai-employee\`) is shared across all tenants.`
     - TO: `One GitHub App per environment is used. Each tenant installs the App for the environment they're connecting to. The App name is configured via \`GITHUB_APP_NAME\` in \`.env\`.`

  2. Replace hardcoded App name on line 30:
     - FROM: `https://github.com/apps/dozaldevs-ai-employee/installations/new?state=<signed>`
     - TO: `https://github.com/apps/<GITHUB_APP_NAME>/installations/new?state=<signed>`

  3. Add a new section **"11. Multi-Environment Setup"** after Section 10 (Troubleshooting), documenting:
     - Why two Apps are needed (single webhook URL + setup URL constraint)
     - The two-App architecture: dev App (Cloudflare tunnel URL) and prod App (Render URL)
     - Which env vars change between environments (`GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`)
     - Which env vars stay the same (`ENCRYPTION_KEY` — used for state signing, not App-specific)
     - Setup URL recommendation: use `/integrations/github/callback` (direct path) for new Apps
     - Security note: webhook secrets MUST be different per environment
     - Quick reference table:

       | Setting        | Dev App                                                                | Prod App                                                 |
       | -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
       | Webhook URL    | `https://local-ai-employee.dozaldevs.com/webhooks/github`              | `https://ai-employees-laaa.onrender.com/webhooks/github` |
       | Setup URL      | `https://local-ai-employee.dozaldevs.com/integrations/github/callback` | `https://ai-employees-laaa.onrender.com/integrations`    |
       | Webhook Secret | Unique per environment                                                 | Unique per environment                                   |
       | Private Key    | Unique per App                                                         | Unique per App                                           |

  4. Update the "Required Environment Variables" table (Section 9, line 270) to add a "Per-Environment?" column:

     | Variable                | Per-Environment? | Notes                              |
     | ----------------------- | ---------------- | ---------------------------------- |
     | `GITHUB_APP_ID`         | YES              | Different App ID per environment   |
     | `GITHUB_APP_NAME`       | YES              | Different App slug per environment |
     | `GITHUB_PRIVATE_KEY`    | YES              | Each App has its own private key   |
     | `GITHUB_WEBHOOK_SECRET` | YES — REQUIRED   | Must be set; 401 if unset          |
     | `ENCRYPTION_KEY`        | NO               | Shared — used for state signing    |

  **Must NOT do**:
  - Do NOT change the production App's Setup URL
  - Do NOT add instructions for App Manifest automation
  - Do NOT mention smee.io or Hookdeck (we chose the two-App pattern)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted edits to a single markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/guides/2026-06-02-1727-github-integration.md:18` — Hardcoded App name "dozaldevs-ai-employee" — must be made environment-agnostic
  - `docs/guides/2026-06-02-1727-github-integration.md:30` — Hardcoded App name in URL example — must use env var placeholder
  - `docs/guides/2026-06-02-1727-github-integration.md:56-58` — Setup URL mismatch documentation — reference for the "direct path" recommendation
  - `docs/guides/2026-06-02-1727-github-integration.md:265-274` — Required Environment Variables table — must add Per-Environment column

  **WHY Each Reference Matters**:
  - Lines 18 and 30 — The specific hardcoded references that Metis identified as needing replacement
  - Lines 56-58 — Context for why the dev App should use the direct path (`/integrations/github/callback`)
  - Lines 265-274 — The table structure to extend with per-environment annotations

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No hardcoded App name in integration guide
    Tool: Bash (grep)
    Preconditions: Guide has been updated
    Steps:
      1. grep -c "dozaldevs-ai-employee" docs/guides/2026-06-02-1727-github-integration.md
      2. If count > 0, check each occurrence is in a clearly marked example/historical context
    Expected Result: 0 occurrences of the hardcoded App name outside of example blocks
    Failure Indicators: Hardcoded App name remains in descriptive text
    Evidence: .sisyphus/evidence/task-3-no-hardcoded-name.txt

  Scenario: Multi-environment section exists
    Tool: Bash (grep)
    Preconditions: Guide has been updated
    Steps:
      1. grep -n "Multi-Environment\|multi-environment\|Two.App\|two.app" docs/guides/2026-06-02-1727-github-integration.md
      2. Verify at least one match exists as a section header
    Expected Result: A section header containing "Multi-Environment" appears in the guide
    Failure Indicators: No multi-environment section found
    Evidence: .sisyphus/evidence/task-3-multi-env-section.txt
  ```

  **Commit**: YES (groups with Tasks 2, 4)
  - Message: `docs(github): add multi-environment setup with two GitHub Apps`
  - Files: `docs/guides/2026-06-02-1727-github-integration.md`
  - Pre-commit: N/A (markdown only)

- [x] 4. Update AGENTS.md with Two-App Architecture

  **What to do**:
  1. Find the GitHub-related content in AGENTS.md. The current section mentions `GITHUB_TOKEN` in the "Environment Variables" section and references GitHub in the "OpenCode Worker" shell tools table. Add a new subsection or update existing content to document:
     - The two-App strategy: one App per environment (dev + prod)
     - Which env vars are per-environment: `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
     - The dev App's base URL: `https://local-ai-employee.dozaldevs.com`
     - The prod App's base URL: `https://ai-employees-laaa.onrender.com`
     - Security constraint: webhook secrets MUST be unique per environment

  2. Update the "Environment Variables" paragraph to mention that `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` are per-environment (different values in dev vs prod `.env`).

  3. Verify the Reference Documents table entry for the GitHub integration guide is accurate. Currently exists as:
     ```
     | `docs/guides/2026-06-02-1727-github-integration.md` | Working on engineer employee — ... |
     ```
     Update the description to mention multi-environment setup if needed.

  **Must NOT do**:
  - Do NOT add employee-specific language in shared sections (AGENTS.md convention)
  - Do NOT duplicate the full multi-environment setup instructions (that belongs in the integration guide)
  - Keep it concise — AGENTS.md is loaded into every LLM call

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted edits to a single markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Environment Variables" — Current GitHub env var documentation
  - `AGENTS.md` § "Reference Documents" — Table entry for the GitHub integration guide
  - `AGENTS.md` § "Key Conventions" — "Shared files must stay employee-agnostic" rule

  **WHY Each Reference Matters**:
  - Environment Variables section — The specific location to add per-environment annotations
  - Reference Documents — Must verify the guide entry description is still accurate after Task 3's changes
  - Key Conventions — Guardrail: the added content must not use employee-specific language

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md mentions per-environment GitHub App vars
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been updated
    Steps:
      1. grep -n "per-environment\|per.environment\|two.*App\|dev.*prod\|GITHUB_APP_ID.*GITHUB_APP_NAME" AGENTS.md
      2. Verify at least one match related to GitHub App configuration
    Expected Result: AGENTS.md contains documentation about per-environment GitHub App setup
    Failure Indicators: No mention of per-environment GitHub configuration
    Evidence: .sisyphus/evidence/task-4-agents-md-github.txt

  Scenario: No employee-specific language in shared AGENTS.md sections
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been updated
    Steps:
      1. Look at the diff of changes made to AGENTS.md
      2. Verify no employee-specific terms like "guest", "summarizer", "Hostfully" were added in the GitHub section
    Expected Result: Added content uses generic language (employee, worker, tenant)
    Failure Indicators: Employee-specific terms in the GitHub configuration section
    Evidence: .sisyphus/evidence/task-4-no-employee-specific.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `docs(github): add multi-environment setup with two GitHub Apps`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm lint`

- [x] 5. End-to-End Verification

  **What to do**:
  1. Verify the full OAuth install flow works with the dev App:

     ```bash
     # Step 1: Verify install redirect uses dev App name
     source .env
     REDIRECT=$(curl -s -o /dev/null -w "%{redirect_url}" "http://localhost:7700/integrations/github/install?tenant=dozaldevs")
     echo "$REDIRECT" | grep "$GITHUB_APP_NAME" && echo "PASS: Install redirect uses dev App" || echo "FAIL: Wrong App name in redirect"
     ```

  2. Verify webhook reception with dev secret:

     ```bash
     source .env
     PAYLOAD='{"action":"created","installation":{"id":99999}}'
     SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | awk '{print $2}')
     HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:7700/webhooks/github" \
       -H "Content-Type: application/json" \
       -H "X-GitHub-Event: installation" \
       -H "X-Hub-Signature-256: sha256=$SIG" \
       -d "$PAYLOAD")
     [ "$HTTP_CODE" = "200" ] && echo "PASS: Webhook accepted (HTTP 200)" || echo "FAIL: HTTP $HTTP_CODE"
     ```

  3. Verify documentation consistency:

     ```bash
     # No hardcoded App name in integration guide
     COUNT=$(grep -c "dozaldevs-ai-employee[^-]" docs/guides/2026-06-02-1727-github-integration.md 2>/dev/null || echo "0")
     [ "$COUNT" = "0" ] && echo "PASS: No hardcoded App name" || echo "FAIL: $COUNT hardcoded references"

     # GITHUB_CLIENT_ID only in DEPRECATED section
     DEPRECATED_LINE=$(grep -n "^# DEPRECATED" .env.example | head -1 | cut -d: -f1)
     CLIENT_LINE=$(grep -n "GITHUB_CLIENT_ID" .env.example | head -1 | cut -d: -f1)
     [ "$CLIENT_LINE" -gt "$DEPRECATED_LINE" ] && echo "PASS: CLIENT_ID in DEPRECATED" || echo "FAIL: CLIENT_ID in active section"
     ```

  4. Save all verification output to evidence files.

  **Must NOT do**:
  - Do NOT modify any files during verification — read-only checks only
  - Do NOT install the dev App on production repositories

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running verification commands and saving output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo — needs all docs updated first)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `src/gateway/routes/github-oauth.ts:51-58` — Install redirect handler (to verify correct App name in URL)
  - `src/gateway/routes/github.ts:15-45` — Webhook handler (to verify HMAC validation with dev secret)

  **WHY Each Reference Matters**:
  - `github-oauth.ts` — Confirms the expected redirect URL format for verification assertions
  - `github.ts` — Confirms the expected webhook validation behavior (200 on valid, 401 on invalid)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full verification suite passes
    Tool: Bash
    Preconditions: Gateway running with dev App credentials in .env, Tasks 2-4 complete
    Steps:
      1. Run all verification commands from "What to do" above
      2. Capture all output to evidence files
    Expected Result: All checks output "PASS"
    Failure Indicators: Any check outputs "FAIL"
    Evidence: .sisyphus/evidence/task-5-full-verification.txt

  Scenario: Wrong webhook secret is rejected (negative test)
    Tool: Bash (curl + openssl)
    Preconditions: Gateway running
    Steps:
      1. PAYLOAD='{"action":"created","installation":{"id":99999}}'
      2. SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "wrong-secret-12345" | awk '{print $2}')
      3. HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:7700/webhooks/github" -H "Content-Type: application/json" -H "X-GitHub-Event: installation" -H "X-Hub-Signature-256: sha256=$SIG" -d "$PAYLOAD")
      4. Assert HTTP_CODE is 401
    Expected Result: HTTP 401 — invalid signature rejected
    Failure Indicators: HTTP 200 or 500
    Evidence: .sisyphus/evidence/task-5-wrong-secret-rejected.txt
  ```

  **Commit**: NO (verification only — no file changes)

- [x] 6. Notify Completion via Telegram

  **What to do**:
  Send Telegram notification that the plan is complete:

  ```bash
  tsx scripts/telegram-notify.ts "✅ github-multi-env complete — Two GitHub Apps configured (dev + prod). All docs updated. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: F1-F4
  - **Blocks**: None

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run the tsx command above
      2. Verify exit code is 0
    Expected Result: Script exits with code 0
    Evidence: .sisyphus/evidence/task-6-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` and `pnpm lint`. Verify NO `.ts` files were modified (this is a docs-only plan). Check that `.env.example` follows section ordering rules from README.md. Verify no markdown files have broken links or formatting issues.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | .ts Changes [NONE/N files] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute all QA scenarios from Tasks 2-5. Verify the OAuth install redirect uses the dev App name. Verify webhook endpoint accepts dev-secret-signed payloads. Verify `.env.example` DEPRECATED section contains `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Verify integration guide contains no hardcoded `dozaldevs-ai-employee` references (except in historical/example context).
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify ONLY documentation files were modified (`.md`, `.env.example`). No `.ts`, `.js`, `.json` changes. Verify all changes are within scope boundaries. Flag any unaccounted changes.
      Output: `Files Changed [N docs/N total] | Scope [CLEAN/VIOLATION] | VERDICT`

---

## Commit Strategy

- **1**: `docs(github): add multi-environment setup with two GitHub Apps` — `.env.example`, `docs/guides/2026-06-02-1727-github-integration.md`, `AGENTS.md`

---

## Success Criteria

### Verification Commands

```bash
# Dev App credentials in .env produce correct install redirect
source .env && curl -s -o /dev/null -w "%{redirect_url}" "http://localhost:7700/integrations/github/install?tenant=dozaldevs"
# Expected: contains GITHUB_APP_NAME value in URL

# GITHUB_CLIENT_ID not in active sections of .env.example
grep -n "GITHUB_CLIENT_ID" .env.example
# Expected: only appears in DEPRECATED section (line > 218)

# No hardcoded App name in integration guide
grep -c "dozaldevs-ai-employee" docs/guides/2026-06-02-1727-github-integration.md
# Expected: 0 (or only in clearly marked example blocks)
```

### Final Checklist

- [ ] Two GitHub Apps exist with independent credentials
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Documentation is accurate and environment-agnostic
