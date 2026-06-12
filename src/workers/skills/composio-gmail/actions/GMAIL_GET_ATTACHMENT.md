# GMAIL_GET_ATTACHMENT

**Description**: Retrieves a specific attachment by ID from a message in a user's Gmail mailbox, requiring valid message and attachment IDs. Returns base64url-encoded binary data (up to ~25 MB); the downloaded file location is at data.file.s3url (also exposes mimetype and name; no s3key). Attachments exceeding ~25 MB may be exposed as Google Drive links — use GOOGLEDRIVE_DOWNLOAD_FILE when a Drive file_id is present instead.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
