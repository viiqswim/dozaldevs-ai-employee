# JIRA_CREATE_ISSUE

**Description**: Creates a new Jira issue (e.g., bug, task, story) in a specified project. IMPORTANT: Different Jira projects may have custom required fields beyond the standard ones (summary, project_key, issue_type). If issue creation fails with 'field X is required', use JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS (requires projectIdOrKey and issueTypeId parameters) to discover available fields for your project, or check your Jira project's configuration. Custom fields can be provided via the 'additional_properties' parameter as a JSON string (e.g., '{"customfield_12345": "value"}'). Rapid bulk creation may trigger HTTP 429 rate limiting; throttle calls and use exponential backoff on 429 responses.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
