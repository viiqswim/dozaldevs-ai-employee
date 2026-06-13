# GOOGLEDRIVE_DELETE_PERMISSION

**Description**: Deletes a permission from a file by permission ID. Deletion is irreversible — confirm the target user, group, or permission type before executing. IMPORTANT: You must first call GOOGLEDRIVE_LIST_PERMISSIONS to get valid permission IDs. To fully revoke public access, the type='anyone' (link-sharing) permission must be explicitly deleted; revoking other permissions leaves the file publicly accessible via link. Use when you need to revoke access for a specific user or group from a file.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
