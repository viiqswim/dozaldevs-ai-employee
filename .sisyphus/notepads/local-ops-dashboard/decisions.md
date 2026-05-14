# Decisions — local-ops-dashboard

## [2026-05-14] Architecture Decisions
- ADMIN_API_KEY: prompt on first load + localStorage persistence (key: 'admin_api_key')
- ANON_KEY: Vite env var (VITE_SUPABASE_ANON_KEY) with fallback to demo key from .env.example
- Default tenant: VLRE (00000000-0000-0000-0000-000000000003)
- Polling interval: POLL_INTERVAL_MS = 5000ms
- dashboard/ at repo root (not src/dashboard/) — own package.json
- No Docker/production changes — local dev only
- Max 10 shadcn/ui components
- Light smoke tests only (≤5 tests)
