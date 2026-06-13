# JIRA_GET_CURRENT_USER

**Description**: Retrieves detailed information about the currently authenticated Jira user. The returned `accountId` is the correct identifier for fields like `lead_account_id` in JIRA_CREATE_PROJECT, JIRA_ADD_WATCHER_TO_ISSUE, and JIRA_REMOVE_WATCHER_FROM_ISSUE — never use email or username in those fields.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
