# JIRA_TRANSITION_ISSUE

**Description**: Transitions a Jira issue to a different workflow state, with support for transition name lookup and user assignment by email. IMPORTANT: Only fields that are on the transition's screen can be set during the transition. Which fields are available depends on the Jira workflow configuration and varies per project. Use JIRA_GET_TRANSITIONS with expand='transitions.fields' to check which fields a transition supports. If a field (e.g., assignee) is not on the transition screen, use a JIRA_EDIT_ISSUE action after the transition to set other fields.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
