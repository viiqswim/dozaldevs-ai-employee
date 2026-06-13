# ONE_DRIVE_LIST_ROOT_DRIVE_CHANGES

**Description**: Tool to list changes in the root of the user's primary drive using a delta token. Use when you need to track file and folder modifications, additions, or deletions in the main OneDrive directory. First call without `token` returns all current items plus an `@odata.deltaLink`; store that token and pass it on subsequent calls to retrieve only incremental changes. Losing the deltaLink token forces a full resync. Responses include deleted items (check `deleted` property) and the root item itself alongside files and folders.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
