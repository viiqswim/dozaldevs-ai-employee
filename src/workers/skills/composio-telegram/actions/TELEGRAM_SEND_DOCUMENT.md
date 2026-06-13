# TELEGRAM_SEND_DOCUMENT

**Description**: Send general files (documents) to a Telegram chat using the Bot API. Prefer over TELEGRAM_SEND_PHOTO when original file format or image resolution must be preserved. Rapid sends trigger flood control (HTTP 429 with `retry_after` seconds); limit to ~1 message/second per chat and wait the specified `retry_after` duration before retrying.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
