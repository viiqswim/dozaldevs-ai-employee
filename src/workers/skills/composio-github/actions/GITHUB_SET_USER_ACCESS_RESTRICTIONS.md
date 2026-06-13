# GITHUB_SET_USER_ACCESS_RESTRICTIONS

**Description**: Replaces the list of users with push access to a protected branch in an organization repository. Important notes: - This action only works on organization-owned repositories (not personal repos) - The branch must already have protection rules with restrictions enabled - This REPLACES (not adds to) the existing list of users with push access - Users must have write access to the repository to be added - The combined total of users, apps, and teams is limited to 100 items - To add users without replacing, use the 'add_user_access_restrictions' action instead

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
