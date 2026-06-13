# TELEGRAM_GET_CHAT_HISTORY

**Description**: Get chat history messages via the getUpdates polling method, filtered by chat_id. Returns only updates from the specified chat. Bot can only retrieve messages sent after it joined the chat; missing older messages is expected. Requires no active webhook — a webhook causes HTTP 409 conflict; delete it before using this tool. Empty result arrays (ok=true) indicate no accessible messages, not a failure. Returned message dates are Unix timestamps in UTC seconds.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
