# GOOGLETASKS_LIST_TASKS

**Description**: Retrieves tasks from a Google Tasks list; all date/time strings must be RFC3339 UTC, and `showCompleted` must be true if `completedMin` or `completedMax` are specified. Response key for tasks is `tasks` (not `items`). No full-text search; filter client-side by title/notes. Results ordered by position, not by date.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
