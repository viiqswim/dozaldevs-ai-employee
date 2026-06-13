# GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE

**Description**: DEPRECATED: Use GOOGLEDRIVE_CREATE_PERMISSION instead; use GOOGLEDRIVE_UPDATE_PERMISSION to modify existing permissions (avoids duplicate entries). Modifies sharing permissions for an existing Google Drive file, granting a specified role to a user, group, domain, or 'anyone'. Bulk calls may trigger 403 rateLimitExceeded (~100 req/100s/user); use jittered exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
