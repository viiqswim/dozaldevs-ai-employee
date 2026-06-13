# JIRA_SEARCH_FOR_ISSUES_USING_JQL_POST

**Description**: DEPRECATED: Use JIRA_SEARCH_ISSUES instead. Searches for Jira Cloud issues using Enhanced JQL via POST request; supports eventual consistency and token-based pagination. Use this POST endpoint for long/complex JQL to avoid HTTP 414 errors on GET-based search. IMPORTANT: This action is for Jira Cloud only and will not work with Jira Server or Data Center instances.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
| additionalProperties | unknown | No |  |
