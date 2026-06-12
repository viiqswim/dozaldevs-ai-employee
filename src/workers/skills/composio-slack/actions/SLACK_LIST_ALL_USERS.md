# SLACK_LIST_ALL_USERS

**Description**: Retrieves a paginated list of all users with profile details, status, and team memberships in a Slack workspace; data may not be real-time. Filter response fields `is_bot`, `is_app_user`, and `deleted` to build human-only rosters. Profile fields like `email` and `phone` may be absent depending on OAuth scopes and workspace privacy settings. Guest/restricted accounts may be omitted based on scopes—do not treat results as a complete directory. High-frequency calls risk HTTP 429; honor the `Retry-After` header and throttle to ~1–2 requests/second. Use stable user IDs rather than display names for mapping. Prefer SLACK_FIND_USERS for targeted lookups; cache results to avoid full-workspace fetches.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
