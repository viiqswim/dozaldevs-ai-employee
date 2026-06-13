# ONE_DRIVE_LIST_SITE_LISTS

**Description**: Tool to list all lists under a specific SharePoint site. Use when you need to enumerate lists within a known site. Returns only Microsoft Graph-supported lists — internal/system lists are excluded, so results may be a strict subset of all site lists (e.g., 13 returned where 108 exist). Results are in the `data.value` array. IMPORTANT: Only works with organizational Microsoft 365 accounts (Azure AD/Entra ID). NOT supported for personal Microsoft accounts (MSA/Outlook.com/Hotmail). Personal OneDrive users cannot access SharePoint sites through this endpoint.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
