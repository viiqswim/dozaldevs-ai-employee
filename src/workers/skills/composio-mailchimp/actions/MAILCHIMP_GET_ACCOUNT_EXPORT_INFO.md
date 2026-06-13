# MAILCHIMP_GET_ACCOUNT_EXPORT_INFO

**Description**: Get detailed information about a specific Mailchimp account export. Use this action to check the status of an export job and retrieve the download URL once it's complete. Exports can take anywhere from a few minutes to several hours depending on account size. Typical workflow: 1. Create an export using 'add_export' action 2. Poll this action periodically to check the 'finished' status 3. Once 'finished' is True, use the 'download_url' to download the ZIP file Note: The download_url is signed and provides direct access to your data without authentication. Keep this URL secure. Completed exports are available for download for up to 90 days.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
