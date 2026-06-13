# JIRA_LIST_ISSUE_COMMENTS

**Description**: Retrieves paginated comments from a Jira issue with optional ordering. Paginate by incrementing `start_at` by `max_results` until the cumulative count reaches the `total` field in the response. A response with `total=0` and an empty comments array means the issue has no comments.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
