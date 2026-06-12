# SLACK_RETRIEVE_CONVERSATION_INFORMATION

**Description**: Retrieves metadata for a Slack conversation by ID (e.g., name, purpose, creation date, with options for member count/locale), excluding message content. The `channel` parameter is effectively required. Private channels, DMs, or channels where the app lacks membership may return restricted data; check `is_archived` and `is_member` fields in the response to diagnose access issues. Bulk lookups may trigger HTTP 429 rate limiting; honor the `Retry-After` response header.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
