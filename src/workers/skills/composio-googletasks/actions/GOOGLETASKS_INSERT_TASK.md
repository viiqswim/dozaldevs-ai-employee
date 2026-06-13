# GOOGLETASKS_INSERT_TASK

**Description**: Creates a new task in a given `tasklist_id`, optionally as a subtask of an existing `task_parent` or positioned after an existing `task_previous` sibling, where both `task_parent` and `task_previous` must belong to the same `tasklist_id` if specified. IMPORTANT: Date fields (due, completed) accept various formats like '28 Sep 2025', '11:59 PM, 22 Sep 2025', or ISO format '2025-09-21T15:30:00Z' and will automatically convert them to RFC3339 format required by the API. Not idempotent — repeated calls with identical parameters create duplicate tasks; track returned task IDs to avoid duplication. High-volume inserts may trigger 403 rateLimitExceeded or 429; apply exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
