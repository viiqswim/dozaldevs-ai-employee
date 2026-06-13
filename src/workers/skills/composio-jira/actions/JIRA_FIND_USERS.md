# JIRA_FIND_USERS

**Description**: DEPRECATED: Use JIRA_FIND_USERS2 instead. Searches for Jira users by email or display name to find account IDs; essential for assigning issues, adding watchers, and other user-related operations. Broad queries may return multiple matches — always disambiguate using full email before selecting an account_id. Results may include app/bot accounts; verify account_type is a human user before use in downstream operations.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
| additionalProperties | unknown | No |  |
