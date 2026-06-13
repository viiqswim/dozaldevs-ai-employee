# GITHUB_LIST_NOTIFICATIONS

**Description**: Tool to list notification threads for the authenticated user with efficient polling support. Use when you need to fetch the user's GitHub notification inbox with filters like unread/participating/since. Returns notification threads plus polling headers (Last-Modified, ETag, X-Poll-Interval) for efficient polling. IMPORTANT: This endpoint requires a Personal Access Token (classic) with 'notifications' or 'repo' scope. It does NOT work with GitHub App tokens or fine-grained personal access tokens. If the token type is incompatible, a clear error message will be returned.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
