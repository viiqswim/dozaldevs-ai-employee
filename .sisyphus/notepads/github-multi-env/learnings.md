# Learnings — github-multi-env

## [2026-06-02] Session Start
- Codebase is fully env-var-driven for GitHub: GITHUB_APP_ID, GITHUB_APP_NAME, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET
- GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET: dead code — GoTrue GitHub OAuth was never activated
- GITHUB_TOKEN: referenced only in deprecated engineering orchestrator (src/workers/orchestrate.mts)
- GITHUB_WEBHOOK_SECRET currently in Webhooks section (.env.example line 169) — must move to GitHub section
- Cloudflare tunnel stable URL: https://local-ai-employee.dozaldevs.com
- Production URL: https://ai-employees-laaa.onrender.com
- Dev App Setup URL should be: https://local-ai-employee.dozaldevs.com/integrations/github/callback (direct, no fallback)
- Prod App Setup URL is currently: /integrations (uses fallback — DO NOT change)
- GitHub section is section 8 per README env var ordering convention

## [2026-06-02] Task 1 Blocker
- Gateway is running (HTTP 200 at /health)
- Install redirect still points to prod App: `dozaldevs-ai-employee`
- User has NOT yet created the dev App or updated .env
- All remaining tasks (T5, F1-F4, T6) are blocked on T1
- T2, T3, T4 are complete and committed (commit 1465bea7)
- Waiting for user to: create GitHub App in UI, update .env, restart gateway
