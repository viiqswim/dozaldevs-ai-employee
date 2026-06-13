# JIRA_GET_ALL_USERS

**Description**: Retrieves all users from the Jira instance including active, inactive, app accounts, and system accounts, with pagination support. On Jira Cloud, fields like `email_address` may be redacted due to privacy settings — never treat them as guaranteed present. Successful responses may silently omit users due to permission restrictions; a smaller-than-expected result set may reflect access limits, not absence of users.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
| additionalProperties | unknown | No |  |
