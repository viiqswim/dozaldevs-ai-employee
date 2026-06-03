# Issues & Gotchas

<!-- Append problems and gotchas here — never overwrite. Format: ## [TIMESTAMP] Task: {task-id} -->

## [2026-06-02] Task: T16 — Regression Results

- motivation-bot-2 task ID: 6f0d77fb-7aa5-4b54-bbc0-87fd555fdd3e
- Final status: Done (reached Done in ~75 seconds, 5 polls)
- Platform rules present: YES (grep found 1 match for "NEVER modify files outside" in compiled_agents_md)
- No spurious assignment injection: YES (0 matches for "Your Assignment" in compiled_agents_md, session_transcript, and metadata)
- IntegrationsPage rows: Slack YES, Jira YES, Notion YES, GitHub YES (all 4 showing "✓ Connected")
- Trigger button works: YES (clicking Trigger for real-estate-motivation-bot-2 immediately created task f8f65682-8dfe-47e6-8fd6-b408cc406ba8 — non-code employees trigger without a modal, which is correct behavior)
- VERDICT: PASS — all regression checks passed, engineering employee changes have no impact on non-code employees

## [2026-06-02] Task: GITHUB_PRIVATE_KEY \n normalization fix

- **Root cause**: `GITHUB_PRIVATE_KEY` in `.env` stores PEM with literal `\n` (backslash-n, two chars). Node's `process.env` does NOT expand these. `crypto.createSign` received a malformed PEM → `ERR_OSSL_UNSUPPORTED`.
- **Fix**: Added `const normalizedKey = privateKey.replace(/\\n/g, '\n');` in `generateInstallationToken()` before passing to `generateAppJwt()`.
- **Verification**: After fix, gateway reloaded (tsx watch), error changed from `ERR_OSSL_UNSUPPORTED` to `GitHub API returned 404 for installation 137559864: Not Found` — meaning JWT generation now succeeds, but the stored `github_installation_id` (137559864) is invalid/revoked on GitHub's side.
- **Remaining issue**: The installation ID `137559864` returns 404 from GitHub API. This is a separate infrastructure issue — the GitHub App installation may have been revoked or the wrong ID is stored in `tenant_secrets`. Needs re-installation of the GitHub App for the VLRE tenant.
- **File changed**: `src/gateway/services/github-token-manager.ts` — committed as `fix(github): normalize GITHUB_PRIVATE_KEY newlines for Node crypto`

## [2026-06-02] Blocker: GitHub App installation ID stale

**Status**: BLOCKED — T15, F3, T17 cannot proceed

**Root cause**: Installation ID `137559864` stored in `tenant_secrets` for VLRE tenant returns 404 from GitHub API. The GitHub App was previously installed but has since been uninstalled/revoked.

**Crypto fix applied**: `GITHUB_PRIVATE_KEY` `\n` normalization is now in `github-token-manager.ts` (line 65). JWT generation works correctly — the 404 is purely an installation ID issue, not a key format issue.

**What's needed**: User must visit `http://localhost:7700/integrations/github/install?tenant=vlre` and complete the GitHub App installation. The callback will automatically store the new installation ID.

**Verification after reinstall**: `curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/github/repos" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.repos | length'` — expect > 0.

## [2026-06-02] F3 Partial Manual QA Results

**Session**: F3 QA execution (all non-GitHub scenarios)
**Date**: 2026-06-02

### Group A — Dashboard UI

- **A1 GitHub integration row**: PASS — "GitHub · Connected · 137559864 · ✓ Connected" row visible in IntegrationsPage
  - Screenshot: `.sisyphus/evidence/final-qa/A1-integrations-github-row.png`
- **A2 Wizard repo picker**: PASS — "Code Repository" section appears in wizard edit step when generating with code-writing description; expanded shows "Select the repository..." picker
  - Screenshot: `.sisyphus/evidence/final-qa/A2-wizard-repo-picker.png`
- **A3 Trigger modal**: PASS — Trigger modal appears on employee detail page (engineer archetype) with "What should this employee work on?" textarea and "Trigger without instructions" button
  - NOTE: Modal is in EmployeeDetail.tsx (detail page), NOT the list page. Clicking Trigger in the list fires immediately for all employees.
  - Screenshot: `.sisyphus/evidence/final-qa/A3-trigger-modal.png`
- **A4 Non-code trigger**: PASS — Trigger on real-estate-motivation-bot-2 (list page) immediately creates task without modal; task `25f1073d-dfaf-4590-ba2f-af9ac4f641de` created
  - Screenshot: `.sisyphus/evidence/final-qa/A4-non-code-trigger.png`

### Group B — API Endpoints

- **B1 Install redirect**: PASS — HTTP 302 from `GET /integrations/github/install?tenant=vlre`
- **B2 Stale install error**: PASS — Returns `{"error":"Failed to authenticate with GitHub"}` gracefully (not a 500 crash)
- **B3 Token endpoint rejects Done task**: PASS — HTTP 403, `{"error":"Task is not in Executing state"}`
- **B4 Code employee detection**: PASS — Generator returns `platform_rules_override: true`, `worker_env: true`, `concurrency_limit: 1`, `vm_size: "performance-1x"`, `approval_required: true`
- **B5 Non-code no code patterns**: PASS — Generator returns `platform_rules_override: false`, `worker_env: false`, `vm_size: null`

### Group C — Regression

- **C1 Platform rules enforced**: PASS — `compiled_agents_md LIKE '%NEVER modify files outside%'` = `t` for non-code task `6f0d77fb-7aa5-4b54-bbc0-87fd555fdd3e`
- **C2 No spurious assignment injection**: PASS — `compiled_agents_md LIKE '%Your Assignment%'` = `f` for same task

### Skipped

- **T15 E2E full happy path**: SKIPPED — GitHub installation ID `137559864` is stale (404 from GitHub API). User must re-install GitHub App via `http://localhost:7700/integrations/github/install?tenant=vlre`

### VERDICT: APPROVE (partial)

All 11 non-GitHub checks pass. T15 remains blocked pending GitHub App re-installation.
