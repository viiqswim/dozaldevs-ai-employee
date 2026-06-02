# Decisions — platform-settings-table

## Architecture Decisions

- Global table (not tenant-scoped) — one row per setting key
- No hardcoded fallbacks — `getPlatformSetting()` throws or returns DB value
- Admin API: GET all + PATCH by key only (no POST, no DELETE)
- `is_required` boolean column — all 8 initial settings are `is_required = true`
- Startup validation: `validateRequiredPlatformSettings()` called in gateway startup, process.exit(1) on failure
- Dashboard UI: simple table with inline edit, health indicator, at `/dashboard/settings`
- Archetype vm_size backfill: NOT needed — `null` correctly falls through to platform default
- Deprecated env vars: DELETE entirely (not moved to DEPRECATED section)

## 8 Platform Settings

| key                          | value          | is_required |
| ---------------------------- | -------------- | ----------- |
| default_worker_vm_size       | performance-1x | true        |
| cost_limit_usd_per_day       | 50             | true        |
| synthesis_threshold          | 5              | true        |
| max_employee_rules_chars     | 8000           | true        |
| max_employee_knowledge_chars | 32000          | true        |
| worker_bash_timeout_ms       | 1200000        | true        |
| issues_slack_channel         | (empty)        | true        |
| cost_alert_slack_channel     | #alerts        | true        |
