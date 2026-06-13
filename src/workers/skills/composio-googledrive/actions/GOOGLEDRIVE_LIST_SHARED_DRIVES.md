# GOOGLEDRIVE_LIST_SHARED_DRIVES

**Description**: Tool to list the user's shared drives. Use when you need to get a list of all shared drives accessible to the authenticated user. Results may differ from the web UI due to admin policies; listing a drive does not guarantee access to its contents. Paginated calls may trigger 403 rateLimitExceeded or 429 tooManyRequests; apply exponential backoff when iterating many pages.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
