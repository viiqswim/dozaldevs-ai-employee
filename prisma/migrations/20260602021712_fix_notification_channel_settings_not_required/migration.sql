-- Notification channel settings are optional (empty = disabled).
-- They should not be required at startup validation.
UPDATE platform_settings
SET is_required = false
WHERE key IN ('issues_slack_channel', 'cost_alert_slack_channel');
