# GITHUB_REVOKE_AN_INSTALLATION_ACCESS_TOKEN

**Description**: Revokes the GitHub App's current installation access token, immediately invalidating it for API authentication. IMPORTANT: This endpoint requires a GitHub App installation access token (ghs_* prefix) for authentication. OAuth tokens (gho_*) or personal access tokens are not supported and will result in a 403 Forbidden error. After successful revocation, the token becomes permanently invalid and cannot be used for any subsequent API calls. To continue API operations, a new installation access token must be generated.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
