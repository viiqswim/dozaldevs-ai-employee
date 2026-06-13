# ONE_DRIVE_COPY_ITEM

**Description**: Tool to copy a DriveItem (file or folder) to a new location asynchronously. Use when you need to duplicate an item, optionally renaming it or specifying a different parent folder. The operation is asynchronous; the response provides a URL to monitor the copy progress. Do not assume the copy is complete immediately; verify via ONE_DRIVE_GET_ITEM or by listing the destination, especially for large folder trees.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
