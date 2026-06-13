# GOOGLEDRIVE_LIST_CHANGES

**Description**: Tool to list the changes for a user or shared drive. Use when a full incremental change feed is needed (for simple recent-file lookups, prefer GOOGLEDRIVE_FIND_FILE instead). Tracks modifications such as creations, deletions, or permission changes. The pageToken is optional - if not provided, the current start page token will be automatically fetched; an empty result is valid if no recent activity has occurred. Example usage: ```json { "pageToken": "22633", "pageSize": 100, "includeRemoved": true } ``` Returns changes with timestamps, file IDs, and modification details. Paginate by following `nextPageToken` until it is absent — stopping early will silently omit changes. Save `newStartPageToken` to monitor future changes efficiently.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
