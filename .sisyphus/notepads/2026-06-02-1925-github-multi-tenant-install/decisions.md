# Decisions

## Architecture Decisions

- Share `installation_id` across tenants — industry-standard (Vercel, Sentry, Linear)
- Smart API lookup via `GET /app/installations` to detect existing installations
- Re-implement JWT generation locally in admin-github.ts rather than importing from token-manager
- Disconnect = soft-delete only, never call GitHub API to uninstall
- Link-installation endpoint verifies installation exists before storing
