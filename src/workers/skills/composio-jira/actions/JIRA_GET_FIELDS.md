# JIRA_GET_FIELDS

**Description**: Tool to retrieve Jira issue fields metadata. Use before editing an issue to discover custom field IDs and names. Custom fields are addressed as customfield_XXXXX in API calls and cf[XXXXX] in JQL; using display names instead causes 400 Unknown field errors. Returns global metadata — cross-reference with JIRA_GET_ISSUE_EDIT_META before editing, as globally visible fields not listed there will also cause 400 errors when sent to JIRA_EDIT_ISSUE. Results are scoped to the authenticated user's permissions, so field sets may differ between users.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
