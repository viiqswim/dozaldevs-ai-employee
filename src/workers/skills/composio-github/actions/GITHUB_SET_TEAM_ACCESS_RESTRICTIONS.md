# GITHUB_SET_TEAM_ACCESS_RESTRICTIONS

**Description**: Replaces the list of teams with push access to a protected branch. This action sets (replaces) the teams that have push access to a protected branch. Unlike 'Add team access restrictions' (POST), this action replaces the entire list rather than adding to it. Use an empty list to remove all team restrictions. Prerequisites: - The repository must be owned by an organization (not a personal account) - The branch must have protection rules enabled - The branch protection must have restrictions configured - The teams must exist in the organization and have repository access

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
