# GOOGLEDRIVE_GET_CHANGES_START_PAGE_TOKEN

**Description**: Tool to get the starting pageToken for listing future changes in Google Drive. Returns only a token — pass it to GOOGLEDRIVE_LIST_CHANGES to retrieve actual changes. Persist this token; losing it requires a full rescan. The token is forward-looking: GOOGLEDRIVE_LIST_CHANGES may return no results if no changes have occurred since issuance. For simple recent-file lookups, prefer GOOGLEDRIVE_FIND_FILE; use this tool only for incremental change-feed workflows.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
