# MAILCHIMP_GET_FILE

**Description**: Retrieve detailed information about a specific file in the Mailchimp File Manager. Returns file metadata including the file's unique ID, name, type, size, URLs for accessing the file (full-size and thumbnail), upload timestamp, and dimensions for image files. Use this action to get the public URL of a file for use in campaigns or to verify file details. Prerequisites: - You need a valid file_id. Use MAILCHIMP_LIST_STORED_FILES to get available file IDs. Returns: - File metadata including id, name, type, size, URLs, and dimensions (for images) - HATEOAS links for related operations (update, delete) Common use cases: - Get the public URL of an uploaded image for use in email campaigns - Verify file upload succeeded and get file details - Check file dimensions before using in templates

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
