# JIRA_GET_ALL_PROJECTS

**Description**: Retrieves all visible projects using the modern paginated Jira API with server-side filtering and pagination support. Results reflect only projects the authenticated user can access — small or empty result sets may indicate permission restrictions, not absence of projects. An empty `values` array means no projects matched the filters; relax `query`, `status`, or `categoryId` if unexpected. Project keys are mutable; prefer the stable numeric project ID for durable references in follow-up calls.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
