# TELEGRAM_SEND_PHOTO

**Description**: Send photos to a Telegram chat using the Bot API. Telegram compresses and re-encodes images; use TELEGRAM_SEND_DOCUMENT to preserve original resolution/format. Each call produces a separate post; no media-group/album support. Returns HTTP 429 with `retry_after` seconds when sending too rapidly.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
