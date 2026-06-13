# JIRA_GET_ALL_GROUPS

**Description**: Retrieves all groups from the Jira instance with pagination support. Useful for resolving correct group names or IDs before passing them to other tools. Some returned groups are system-managed and may be inaccessible via other group operations. On large instances, omitting both pagination parameters to fetch all groups can be expensive; prefer targeted lookups with max_results and start_at when possible.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
