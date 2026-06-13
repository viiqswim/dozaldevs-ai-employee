# GOOGLEDRIVE_RESUMABLE_UPLOAD

**Description**: Tool to start and complete a Google Drive resumable upload session. Use for files larger than ~5 MB to avoid timeouts or size-limit failures. HTTP 308 means continue the session from the correct byte offset; HTTP 410 means the session expired and a full restart with a new session is required.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
