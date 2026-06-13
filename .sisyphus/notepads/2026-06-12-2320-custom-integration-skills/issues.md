# Issues — custom-integration-skills

## [2026-06-13] Session Start — No issues yet

## [2026-06-13] Task 10 — PRE-EXISTING PLATFORM BUG discovered (UNRELATED to custom-skills)

### Zero-secret tenant loses ALL platform env vars (LLM keys) → task always Fails

**Symptom**: Triggering any task for a tenant with NO `slack_bot_token` secret (e.g. snobahn
00000000-0000-0000-0000-000000000004) Fails in ~2s. Harness logs `goKeyPresent:false` AND
`OPENROUTER_API_KEY not set`, then `Model not found` / `ProviderModelNotFoundError`.

**Root cause** (proven via docker inspect of injected container env):
- `loadTenantSlack()` at `src/inngest/lifecycle/steps/notify-and-track.ts:31-33`:
  `const botToken = tenantEnv['SLACK_BOT_TOKEN'] ?? ''; if (!botToken) return null;`
- `machine-provisioner.ts:71`: `const tenantEnv = slackCtxForExec?.tenantEnv ?? {};`
- So when a tenant has no slack token, loadTenantSlack returns null, tenantEnv becomes `{}`,
  and ALL PLATFORM_ENV_WHITELIST keys (OPENCODE_GO_API_KEY, OPENROUTER_API_KEY, COMPOSIO_API_KEY,
  DATABASE_URL, SUPABASE_*, etc.) are dropped from the worker container env.
- Worker has no LLM provider key → every model fails to authenticate → task Fails.

**Proof**:
- VLRE (has slack_bot_token): docker inspect shows OPENCODE_GO_API_KEY + OPENROUTER_API_KEY injected → Done
- snobahn (no secrets): docker inspect shows NEITHER key → Failed
- After adding slack_bot_token to snobahn: both keys injected again → task runs the model normally

**NOT a custom-skills bug** — filterCustomSkills ran correctly in every snobahn run
(connectedServices=[], removed=[github,hostfully,sifely,slack]). This is a separate platform
defect in the env-assembly path. Suggested fix (NOT done here — out of task scope): in
machine-provisioner, load platform env independently of slack context (call loadTenantEnvFull
which already exists at notify-and-track.ts:45), OR don't gate tenantEnv on botToken presence.

### Stale "Inherited Wisdom" in task brief (corrected by live data)
- Brief claimed VLRE has Hostfully+Sifely and lacks github/slack custom secrets.
- ACTUAL VLRE tenant_secrets: sifely_username, sifely_password, slack_bot_token, github_installation_id
  (+ github integration row). NO hostfully_* secret.
- So real VLRE filter result: KEEP sifely/slack/github, FILTER hostfully (inverse of brief).
  The filter matched real data perfectly — test is stronger this way.
