# GITHUB_REMOVE_TEAM_MEMBERSHIP_FOR_A_USER

**Description**: Removes a user from a specific team within an organization. This action requires admin:org scope permissions. It will fail if: - Team synchronization with an Identity Provider (IdP) is enabled (403 Forbidden) - The organization, team, or user membership doesn't exist (404 Not Found) - You don't have sufficient permissions to manage team memberships (403 Forbidden) Note: If the removed user was the last member and the team is not nested, the team may be deleted automatically.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
