# MAILCHIMP_ADD_EXPORT

**Description**: Create a new account export in your Mailchimp account. This action initiates an export of your Mailchimp account data as a downloadable ZIP file. The export runs in the background and may take from a few minutes to several hours depending on account size. Use the 'get_account_export_info' action with the returned export_id to check progress and retrieve the download URL. Important limitations: - Only one export can run at a time per account - Only one export can be created per 24-hour period - Completed exports are available for download for 90 days

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
