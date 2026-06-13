# ONE_DRIVE_LIST_DRIVES

**Description**: Tool to retrieve a list of Drive resources available to the authenticated user, or for a specific user, group, or site. Use when you need to find out what drives are accessible. Returns only drives within the signed-in account's permission scope; missing drives indicate insufficient permissions or different tenant scope. Results are paginated — follow skip_token across all pages to avoid missing drives. Returned drives represent document libraries and may not reflect full SharePoint site structure; use SHARE_POINT_GET_SITE_COLLECTION_INFO or SHARE_POINT_SEARCH_QUERY for broader coverage. Use driveType and webUrl to distinguish personal, system, and SharePoint-backed drives.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
