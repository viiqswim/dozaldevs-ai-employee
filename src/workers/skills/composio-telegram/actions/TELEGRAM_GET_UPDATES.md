# TELEGRAM_GET_UPDATES

**Description**: Use this method to receive incoming updates using long polling. An Array of Update objects is returned. IMPORTANT: This method will not work if an outgoing webhook is set up. Webhooks and getUpdates are mutually exclusive — call deleteWebhook first to switch modes (409 Conflict otherwise). Notes: - Only one method (webhook or polling) can be active at a time - Updates available for up to 24 hours if unclaimed - Recalculate offset after each response to avoid duplicates - Empty result array (ok=true) is valid, meaning no new updates - On HTTP 429, honor the retry_after value; keep polling to ~1 request/second - Only chats with updates since the bot joined or last offset appear in results - Update objects vary by type; always check update.message and update.message.text exist before accessing

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
