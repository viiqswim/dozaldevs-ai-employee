# Issues — slack-per-dev-app-architecture

## [2026-06-06] Plan initialized

### Known Blockers

1. **Sandbox Socket Mode support** — unverified; SPIKE must confirm `xapp-` tokens work in Developer Sandbox
2. **`slack run` token injection form** — unverified; SPIKE must determine if it sets `process.env.SLACK_APP_TOKEN` or only writes `.slack/apps.dev.json`
3. **Process ownership** — unverified; SPIKE must confirm `dev.ts` clean shutdown still works with `slack run` in the mix
4. **Sandbox teamId registration** — confirmed blocker; `fetchInstallation` will throw `"No installation for team: <teamId>"` without a matching `slack_integrations` row

### Guardrails (DO NOT VIOLATE)

- Do NOT modify `socket-mode-lock.ts`, single-instance guard (dev.ts:243-254), or Step-0 reaper (dev.ts:280) — EXCEPT extend reaper ONLY if SPIKE proves `slack run` changes process parentage
- Do NOT use Render `PUT /env-vars` for Inngest keys
- Do NOT migrate prod Slack app to CLI manifest
- Do NOT alter `tenant_secrets` schema or redesign `TenantInstallationStore`
- Do NOT commit `.slack/apps*.json` or any `xapp-`/`xoxb-`/`xoxp-` token
- Do NOT accept single @mention as proof — must do 20-trial uuid-tagged proof
