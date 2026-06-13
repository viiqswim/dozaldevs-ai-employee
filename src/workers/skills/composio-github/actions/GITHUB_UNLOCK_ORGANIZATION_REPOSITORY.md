# GITHUB_UNLOCK_ORGANIZATION_REPOSITORY

**Description**: Unlocks a repository that was locked for migration within a GitHub organization. This action is part of the organization migrations workflow. When you start a migration with `lock_repositories=true`, the source repositories are locked to prevent changes during export. After the migration is complete and applied to the target instance, use this action to unlock the repositories so they can be accessed or deleted. Requirements: - You must be an organization owner to unlock repositories - The repository must be currently locked as part of the specified migration - This endpoint does not work with GitHub App tokens or fine-grained personal access tokens Typical workflow: 1. Start an organization migration with POST /orgs/{org}/migrations 2. Wait for the migration to complete (state: "exported") 3. Apply the migration to your target instance 4. Unlock each migrated repository using this action 5. Delete the source repositories if no longer needed

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
