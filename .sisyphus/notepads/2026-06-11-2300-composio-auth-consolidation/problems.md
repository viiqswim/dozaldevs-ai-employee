# Problems — composio-auth-consolidation

## [2026-06-12] Plan Start

No blockers yet.

## [2026-06-12] Task 2 — Blockers found (do NOT block plan; document for user)

### P1 — Composio token masking is ON (contradicts inherited assumption)
Slack + GitHub tokens are NOT readable. Live values are masking placeholders:
  slack="xoxp..." (7 chars), github="REDACTED" (8 chars), gmail="REDACTED" (8 chars).
USER ACTION REQUIRED: In the Composio dashboard, open Project Settings and set
  `mask_secret_keys_in_connected_account: false`. Then re-run the token check.
Until then no raw Slack/GitHub token can be extracted for direct CLI use.

### P2 — GitHub is Composio-managed, not own-app
GitHub auth config ac_2mXVfyCm49K1 is managed=true. Target model requires an own-app
GitHub OAuth (managed=false) with `repo` scope so the platform can use git/gh CLI.
USER ACTION REQUIRED: Create a custom GitHub auth config in Composio (own OAuth app,
repo scope), disable masking, then reconnect the VLRE tenant through that config.

### P3 — getComposioConnectionToken false-positive on bare "REDACTED"
src/lib/composio/connection-token.ts isMaskedToken() only catches "[REDACTED]"
(bracketed). Composio returns bare "REDACTED" for github/gmail, so the helper
returns the placeholder as a valid token. Needs a fix (out of scope for this
verification task — flagged for the implementation task).

### P4 — Missing connections for required toolkits
  github:      not in gateway composio_connections table (only in Composio, masked)
  notion:      in gateway DB but NOT in Composio connectedAccounts.list under tenant user_id
  googledrive: missing everywhere
  jira:        missing everywhere
USER ACTION (if these employees are needed): connect each via the Composio OAuth
flow (GET /admin/tenants/<id>/composio/connect?toolkit=<slug>) in a browser.

### Note on duplicates
Composio has 4 ACTIVE "slack" accounts + 1 EXPIRED, 1 ACTIVE + 1 EXPIRED github,
1 ACTIVE + 1 EXPIRED gmail for tenant_<id>. Duplicate active connections may cause
nondeterministic token selection (helper picks first match). Consider de-duping.
