# ONE_DRIVE_DELETE_ITEM

**Description**: Tool to delete a DriveItem (file or folder) by its unique ID from the authenticated user's OneDrive. Use when you need to remove an item from OneDrive. This action moves the item to the recycle bin, not permanently deleting it; storage quota is not freed until the recycle bin is emptied. Bulk deletions can trigger 429 (rate limit) or 5xx responses — limit concurrency and use exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
