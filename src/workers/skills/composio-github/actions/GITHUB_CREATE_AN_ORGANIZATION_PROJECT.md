# GITHUB_CREATE_AN_ORGANIZATION_PROJECT

**Description**: Creates a new classic project board within a specified GitHub organization. Note: This action uses GitHub's Projects (classic) REST API. The classic projects feature may be disabled in some organizations, and GitHub recommends migrating to Projects V2 (accessible via GraphQL API) for new projects. Requirements: - The authenticated user must be an organization member with project creation permissions - Classic projects must be enabled for the organization - Requires 'repo' and 'admin:org' or 'write:org' scopes

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
