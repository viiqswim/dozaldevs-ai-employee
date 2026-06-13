# GITHUB_ADD_OR_UPDATE_TEAM_PROJECT_PERMISSIONS

**Description**: Adds a classic project to a team or updates the team's permission on it. This endpoint grants or updates permissions for a team on a specific classic project (not Projects V2). The authenticated user must have admin permissions for the project. Both the team and project must belong to the same organization. Requirements: - The project must be a classic project (not GitHub Projects V2) - The authenticated user must have admin permissions on the project - The team and project must be in the same organization - Requires 'admin:org' scope for the authentication token Returns HTTP 204 No Content on success, 403 if project is not an org project, or 404 if the organization, team, or project is not found.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
