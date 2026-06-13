# MAILCHIMP_DELETE_CAMPAIGN_FOLDER

**Description**: Delete a specific campaign folder from Mailchimp. When a campaign folder is deleted, all campaigns within that folder are automatically marked as 'unfiled' rather than being deleted. This operation is idempotent - deleting an already-deleted folder will return an error indicating the folder was not found. Returns HTTP 204 No Content on success.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
