# GOOGLEDRIVE_GET_FILE_METADATA

**Description**: Tool to get a file's metadata by ID. Use to verify `mimeType`, `parents`, and `trashed` status before destructive operations (delete/move/export), or to confirm `mimeType='application/vnd.google-apps.document'` before calling GOOGLEDOCS_* tools (non-native files require GOOGLEDRIVE_DOWNLOAD_FILE). Only returns metadata visible to the connected account; public access requires GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE. High-frequency calls risk `403 rateLimitExceeded`; apply exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
