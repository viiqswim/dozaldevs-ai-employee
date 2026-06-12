# SLACK_SEND_MESSAGE

**Description**: Posts a message to a Slack channel, DM, or private group. Provide exactly one visible content mode: `markdown_text` for normal Markdown content, or `blocks` for raw Slack Block Kit layouts. Use `fallback_text` only with `blocks`; it maps to Slack's top-level `text` fallback. Fails with `not_in_channel`, `channel_not_found`, or `channel_is_archived` if the bot lacks access. Rate-limited at ~1 req/sec (HTTP 429, honor `Retry-After`). Not idempotent — duplicate calls post duplicate messages.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
| additionalProperties | unknown | No |  |
