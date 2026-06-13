# OPENROUTER_GET_CREDITS

**Description**: Tool to get the current API credit balance for the authenticated user. Use before large or batch jobs to verify sufficient balance. A successful response may return total_credits=0, which confirms authentication but will cause all paid model generations to fail. Avoid polling this endpoint; call only as needed.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
