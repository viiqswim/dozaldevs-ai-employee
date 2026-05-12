# Decisions — platform-generalization

## 2026-05-12 Architectural Decisions (from plan)
- Triggers: external cron service calling admin API (no new Inngest functions)
- Notifications: Generic NotificationEnrichment interface + adapter registry
- Tool registry: keep as documentation metadata only (no runtime enforcement)
- Pre-checks: leave as-is (only guest-messaging needs one)
- HOSTFULLY_MOCK: move to VLRE tenant secrets
- Delivery adapter: reuse enrichment_adapter key for delivery adapters too
