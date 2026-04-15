# Decisions — summarizer-mvp

## [2026-04-15] Initial Decisions (from planning)

- Express replaces Fastify (user confirmed)
- @slack/bolt for interaction handling (not raw HMAC verification)
- @slack/web-api for all Slack API calls (not raw fetch)
- Fly.io Machine execution model (not inline Inngest function)
- Machine pools deferred to post-MVP
- No redispatch/retry for summarizer (fail gracefully, one attempt per day)
- No multi-tenancy activation (single default tenant)
- FLY_SUMMARIZER_APP separate from FLY_WORKER_APP
- New nullable fields on Archetype model (system_prompt, steps, model, deliverable_type)
