# GITHUB_REVIEW_RESOURCE_REQUESTS_WITH_FINE_GRAINED_TOKENS

**Description**: Approves or denies multiple fine-grained personal access token requests for an organization in bulk. This endpoint processes multiple PAT request approvals or denials in a single API call. All specified pat_request_ids must refer to currently pending requests. Important: This endpoint can ONLY be called by GitHub Apps with the 'organization_personal_access_token_requests:write' permission. It cannot be called with personal access tokens or OAuth apps. On success, returns HTTP 202 Accepted with an empty body.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
