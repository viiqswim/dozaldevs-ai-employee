# GITHUB_SET_SELECTED_REPOSITORIES_FOR_AN_ORGANIZATION_SECRET

**Description**: Replaces the list of repositories that can access an organization secret; only effective if the secret's visibility is 'selected'. Prerequisites: - The organization secret must already exist - The secret's visibility must be set to 'selected' (not 'all' or 'private') - Requires admin:org scope or actions secrets fine-grained permission This action completely replaces the repository access list. To add or remove individual repositories without affecting others, use the dedicated add/remove repository actions instead.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
