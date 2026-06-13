# GOOGLEDRIVE_CREATE_FILE_FROM_TEXT

**Description**: Creates a new file in Google Drive from provided text content (up to 10MB), supporting various formats including automatic conversion to Google Workspace types. Returns flat metadata fields (`id`, `mimeType`, `name`) at the top level — not nested under a `file` object. Created files are private by default; use a sharing tool afterward for collaborative access. Rapid successive calls may trigger `403 rateLimitExceeded` or `429 userRateLimitExceeded`; apply exponential backoff between retries. Does not support shared-drive targets in all cases.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
