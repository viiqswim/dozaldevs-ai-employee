# Decisions

## [2026-06-01] Architecture Decisions

- Dashboard bundled with Express gateway (served at /dashboard/) — NOT Vercel
- Platform default domains (no custom domain setup)
- GitHub Actions for CI/CD
- US East (Ohio) for all services
- Render Starter ($7/mo) for gateway
- Supabase Cloud Pro ($25/mo) for DB + PostgREST
- Fly.io Machines (pay-per-use) for workers
- Inngest Cloud (free tier) for orchestration
