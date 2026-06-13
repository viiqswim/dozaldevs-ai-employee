# GITHUB_STOP_A_CODESPACE_FOR_AN_ORGANIZATION_USER

**Description**: Stops a running codespace for an organization member. This action allows organization administrators to stop a codespace that belongs to a member of their organization. The codespace must be in a running state (e.g., 'Available') to be stopped. Required permissions: - OAuth/PAT: admin:org scope - Fine-grained tokens: 'Organization codespaces' (write) or 'Codespaces lifecycle admin' (write) Common HTTP responses: - 200: Codespace successfully stopped, returns codespace object - 304: Not modified (codespace already stopped) - 401: Authentication required - 403: Insufficient permissions (need admin:org) - 404: Organization, user, or codespace not found

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
