# Decisions — jira-integration

## [2026-05-21] Session Start

- Shell tools use Basic auth only (not OAuth) — simplest and most robust, tokens don't expire hourly
- Old /webhooks/jira route preserved for backward compatibility — add new /webhooks/jira/:tenantSlug/:employeeSlug alongside
- Webhook secret scope: per-tenant (one secret per tenant, not per-employee)
- Webhook URL base URL in dashboard: window.location.origin or JIRA_REDIRECT_BASE_URL env var
- ADF wrapping internal to shell tools — AI employees write plain text only
- POST /rest/api/3/search/jql (NOT deprecated GET /rest/api/3/search)
- Must store cloudId from OAuth accessible-resources endpoint
