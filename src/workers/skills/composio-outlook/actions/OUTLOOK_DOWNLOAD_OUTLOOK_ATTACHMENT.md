# OUTLOOK_DOWNLOAD_OUTLOOK_ATTACHMENT

**Description**: Downloads a specific file attachment from an email message in a Microsoft Outlook mailbox; the attachment must contain 'contentBytes' (binary data) and not be a link or embedded item. The returned data.file.s3url is temporary — download the file immediately after calling this tool; call again to get a fresh URL if needed. High-volume parallel calls may trigger HTTP 429 responses; honor the Retry-After header and use exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
