# Pre-flight Check — 2026-06-17

## Gateway (Port 7700)

- **Count**: 1 ✅ (exactly one process)
- **PID**: 77981 (node)
- **Health**: `{"status":"ok"}` ✅

## Inngest (Port 8288)

- **Reachable**: ✅ (HTML UI returned)

## Docker Infrastructure

| Container                     | Status                  |
| ----------------------------- | ----------------------- |
| ai-employee-auth              | Up 8 days (healthy) ✅  |
| ai-employee-rest              | Up 2 weeks ✅           |
| supabase-local-meta-1         | Up 2 weeks (healthy) ✅ |
| ai-employee-kong              | Up 2 weeks (healthy) ✅ |
| shared-redis                  | Up 2 weeks (healthy) ✅ |
| shared-postgres               | Up 2 weeks (healthy) ✅ |
| shared-mailpit                | Up 2 weeks (healthy) ✅ |
| supabase-ai-employee-studio-1 | Up 2 weeks (healthy) ✅ |

## Worker Image

- **Image**: `ai-employee-worker:latest` ✅
- **ID**: f6d906a10ad7
- **Size**: 1.97GB

## Cost Headroom

- **Limit**: $50.00/day (`cost_limit_usd_per_day = 50`)
- **Today's spend (VLRE tenant)**: $0.00
- **Headroom**: $50.00 ✅ (full budget available)

## Summary

All systems green. Single gateway confirmed. Full cost headroom available. Ready to proceed.
