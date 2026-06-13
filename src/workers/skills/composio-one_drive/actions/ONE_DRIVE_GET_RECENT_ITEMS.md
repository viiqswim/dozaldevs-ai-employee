# ONE_DRIVE_GET_RECENT_ITEMS

**Description**: Get files and folders recently accessed by the user. Returns items based on activity history (opened, edited, viewed), sorted by most recent first — NOT by modification time; use ONE_DRIVE_ONEDRIVE_LIST_ITEMS or ONE_DRIVE_LIST_ROOT_DRIVE_CHANGES for strictly modification-based queries. Use when you need to see what the user worked on recently (e.g., 'Show me files I worked on today'). Different from search - this tracks activity, not content. Results may contain duplicate names; disambiguate using lastModifiedDateTime, parentReference.path, and the file/folder property before acting on a specific item.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
