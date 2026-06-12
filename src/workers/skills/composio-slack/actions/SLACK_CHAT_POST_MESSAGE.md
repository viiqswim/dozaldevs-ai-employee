# SLACK_CHAT_POST_MESSAGE

**Description**: (DEPRECATED: use `SLACK_SEND_MESSAGE`) Posts a message to a Slack channel, DM, or private group; requires at least one content field (`markdown_text`, `text`, `blocks`, or `attachments`) — omitting all causes a `no_text` error. Fails with `not_in_channel`, `channel_not_found`, or `channel_is_archived` if the bot lacks access. Body limit ~4000 characters. Rate-limited at ~1 req/sec (HTTP 429, honor `Retry-After`). Not idempotent — duplicate calls post duplicate messages.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
