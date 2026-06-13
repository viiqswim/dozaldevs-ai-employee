# ONE_DRIVE_UPDATE_FILE_CONTENT

**Description**: Tool to update an existing file's content in OneDrive. When called without a `file` parameter, creates an upload session and returns its uploadUrl (legacy behavior — caller drives the PUT uploads). When called with a `file` (FileUploadable), the action streams the file's bytes in chunks via the upload session and returns the final updated DriveItem. The item's ID is preserved (existing share links remain valid) unless conflict_behavior=rename causes the server to create a new item.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
