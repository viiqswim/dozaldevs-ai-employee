# SLACK_LIST_ALL_CHANNELS

**Description**: Lists conversations available to the user with various filters and search options. Always use resolved `channel_id` (not display names) for downstream operations, as names may be non-unique. The `created` field in results is a Unix epoch timestamp (UTC). Pagination across large workspaces may return HTTP 429 with a `Retry-After` header; honor the delay and resume from the last successful cursor.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
