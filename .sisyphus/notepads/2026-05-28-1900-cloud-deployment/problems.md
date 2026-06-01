# Problems / Blockers

## [2026-06-01] HARD BLOCK — Cloud Provisioning Required

**Status**: 10/17 tasks complete. 7 tasks remain. ALL 7 are blocked on external cloud provisioning.

**Checked on 3 consecutive boulder continuations** — credentials have not changed.

### Blocked tasks and their specific dependencies:

| Task | Specific blocker |
|------|-----------------|
| T6 | User must create Supabase Cloud Pro project at supabase.com/dashboard |
| T7 | User must create Render web service at render.com (needs T6 + T8 credentials first) |
| T8 | User must create Inngest Cloud account at app.inngest.com (INNGEST_EVENT_KEY starts with "local" — not a real cloud key) |
| T11 | Needs DATABASE_URL_DIRECT pointing to Supabase Cloud (currently localhost) |
| T12 | Needs GATEWAY_PUBLIC_URL (Render URL) — currently empty |
| T13 | Needs T12 complete |
| F3  | Needs live Render + Inngest Cloud + Supabase Cloud |

### What the user must provide:
1. `DATABASE_URL` — Supabase Cloud transaction pooler URL
2. `DATABASE_URL_DIRECT` — Supabase Cloud direct connection URL  
3. `SUPABASE_URL` — `https://{ref}.supabase.co`
4. `SUPABASE_ANON_KEY` — Supabase Cloud anon key
5. `SUPABASE_SECRET_KEY` — Supabase Cloud service_role key
6. `INNGEST_EVENT_KEY` — Real Inngest Cloud event key (NOT starting with "local")
7. `INNGEST_SIGNING_KEY` — Real Inngest Cloud signing key (NOT starting with "local")
8. `GATEWAY_PUBLIC_URL` — `https://{service}.onrender.com` after Render deploy

### Resolution path:
User adds cloud credentials to `.env`, then triggers boulder continuation.
Atlas will then execute T11 → T12 → T13 → F3 automatically.
