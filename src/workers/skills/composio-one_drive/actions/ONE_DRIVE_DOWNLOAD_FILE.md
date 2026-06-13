# ONE_DRIVE_DOWNLOAD_FILE

**Description**: Downloads a file from a user's OneDrive using its item ID, which must refer to a file and not a folder. Response contains a content object with fields: s3url (URL to fetch raw file bytes), mimetype, and name; raw file data is not returned directly. Parsing content from Excel, Word, PDF, or other formats requires additional tooling. The response also includes attachment.s3key, required when passing this file to downstream tools such as OUTLOOK_SEND_EMAIL or OUTLOOK_CREATE_DRAFT.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
