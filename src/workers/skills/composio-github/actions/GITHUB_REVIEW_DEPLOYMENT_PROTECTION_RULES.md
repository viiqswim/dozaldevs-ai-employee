# GITHUB_REVIEW_DEPLOYMENT_PROTECTION_RULES

**Description**: Approves or rejects pending custom deployment protection rules for a workflow run. This endpoint allows GitHub Apps to review their own pending custom deployment protection rules for a specific workflow run. The review can either approve (allowing the deployment to proceed) or reject (blocking the deployment). **Important notes:** - GitHub Apps can only review their own custom deployment protection rules - This endpoint requires GitHub App installation access tokens with Deployments permission (write) - Custom deployment protection rules are available in public repos for all plans; for private/internal repos, GitHub Enterprise is required - Returns 204 No Content on success

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
