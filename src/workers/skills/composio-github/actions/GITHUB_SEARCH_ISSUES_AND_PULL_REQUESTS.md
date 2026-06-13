# GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS

**Description**: Searches GitHub for issues and pull requests. Supports keywords, qualifiers (repo:, org:, user:, state:, label:, author:, assignee:, mentions:, etc.), and type filters (is:issue, is:pr). Type filters cannot be used alone - they must be combined with at least one keyword or other qualifier. All other qualifiers work independently. The @me shorthand (e.g., assignee:@me, mentions:@me) is automatically resolved to your username. Logical operators (AND, OR, NOT) are supported but limited to a maximum of 5 operators total per query.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
