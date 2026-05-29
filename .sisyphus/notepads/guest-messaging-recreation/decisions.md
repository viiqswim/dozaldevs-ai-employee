# Decisions — guest-messaging-recreation

## [2026-05-29] Initial decisions

### Generator improvement approach

- Inject tool catalog DYNAMICALLY from discoverTools() — not hardcoded
- Env vars: document the MECHANISM (webhook payload → uppercase env vars), not specific names
- Approval pattern: generic ("check Available Tools for specialized approval tool"), not specific tool names
- Delivery: add Template B (external API) alongside Template A (Slack)

### Archetype cutover

- Soft-delete old BEFORE activating new (avoid dual-active race condition)
- New archetype created via wizard only — no manual patching
- Webhook handler finds active archetype by role_name — seamless cutover

### E2E test approach

- Real Airbnb message from Olivia's test account (not mock webhook)
- Airbnb thread: https://www.airbnb.com/guest/messages/2525238359
- Manual approval fallback via curl if Slack button fails
- Evidence saved to .sisyphus/evidence/
