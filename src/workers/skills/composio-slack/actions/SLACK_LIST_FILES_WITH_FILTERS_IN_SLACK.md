# SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK

**Description**: Lists files and their metadata within a Slack workspace, filterable by user, channel, timestamp, or type; returns metadata only, not file content. Results are limited to files visible to the authenticated user — files in private channels or restricted to certain members require appropriate membership and permissions. For large workspaces, check `paging.pages` in the response to determine total pages when paginating.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
