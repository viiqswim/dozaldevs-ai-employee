# GITHUB_AUTH_USER_DOCKER_CONFLICT_PACKAGES_LIST

**Description**: List Docker packages with migration conflicts for the authenticated user. This endpoint lists all Docker packages owned by the authenticated user that encountered namespace conflicts during the Docker-to-GitHub Container Registry (GHCR) migration. Conflicts occur when a package with the same name exists in both the legacy Docker registry and GHCR. IMPORTANT: The Docker registry for GitHub Packages was deprecated on Feb 24, 2025. This endpoint may return a 400 error with message 'Package migration for docker is no longer supported' as the migration period has ended. In this case, the action returns an informative response instead of failing. Use case: Identifying packages that require manual migration to GHCR. Required scope: read:packages (for OAuth and personal access tokens).

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
