# GITHUB_REPLACE_REPO_ACCESS_ON_ORG_DEV_ENV_SECRET_SET

**Description**: Replaces the list of repositories that can access an organization-level Codespaces secret. This operation completely replaces the existing list of repositories with the provided list. The secret must already have its visibility set to 'selected' for this operation to succeed. Use this when you want to set an exact list of repositories that should have access. Prerequisites: - The organization must exist and you must have admin:org scope - The Codespaces secret must already exist in the organization - The secret's visibility must be set to 'selected' (not 'all' or 'private') Returns HTTP 204 No Content on success, 404 if secret/org not found, 409 if visibility is not 'selected'.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
