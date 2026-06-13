# JIRA_GET_TRANSITIONS

**Description**: Retrieves available workflow transitions for a Jira issue. Always use the numeric `id` from the response when calling JIRA_TRANSITION_ISSUE — transition IDs are project/workflow-specific and must not be hardcoded or reused across different issues or projects. When multiple transitions share similar names, use `id` to disambiguate.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
