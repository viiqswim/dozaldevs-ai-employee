# JIRA_GET_ISSUE_TYPES

**Description**: Retrieves all Jira issue types available to the user using the modern API v3 endpoint; results vary based on 'Administer Jira' global or 'Browse projects' project permissions. Response includes two shapes: global issue types (no scope field) and project-scoped types (include scope.project.id); deduplicate by id, not name. Always use issuetype.id (not display name) when referencing issue types in other API calls to avoid validation errors.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
