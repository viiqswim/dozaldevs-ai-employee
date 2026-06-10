# Decisions — CI Deploy Pipeline Automation

## [2026-06-10] Session Start

### Decision: GitHub Actions as single control panel

- Render autoDeploy switched OFF (not deleted)
- GitHub Actions triggers + watches + reports the Render deploy
- Render logs pulled into Actions run output
- Single pane of glass for the whole deploy story

### Decision: Migrate via GitHub Actions job (not Render preDeploy)

- New `migrate` job in deploy.yml
- `needs: test` (gated on CI green)
- Uses `PROD_DATABASE_URL_DIRECT` secret (port 5432)
- PostgREST schema reload after migrate

### Decision: Fix tests, not code

- admin-members RBAC: test expects 403, code returns 200 (correct) — fix test
- Integration tests: old X-Admin-Key auth — modernize to Bearer/SERVICE_TOKEN

### Decision: Concurrency serialize (cancel-in-progress: false)

- Never cancel a mid-flight migrate job
- Overlapping merges serialize

### Decision: Gateway build stays on Render

- Moving gateway build to GitHub Actions is out of scope for this plan
- Document as future enhancement
