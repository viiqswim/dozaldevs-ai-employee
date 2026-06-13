# TELEGRAM_DELETE_MESSAGE

**Description**: Delete a message, including service messages. Limitations: cannot delete messages older than 48 hours in groups, forwarded messages, or content in protected chats (returns 400 'message can’t be deleted'). Bot must have delete/manage rights in the target chat; works reliably only on bot-authored messages in groups. Verify permissions via TELEGRAM_GET_CHAT or TELEGRAM_GET_CHAT_ADMINISTRATORS before calling. On flood control, Telegram returns HTTP 429 with a retry_after field; honor that backoff value.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
