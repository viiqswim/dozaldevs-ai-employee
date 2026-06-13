# GITHUB_REREQUEST_A_CHECK_SUITE

**Description**: Triggers a new run of an existing check suite within a repository, resetting its status to 'queued', clearing its conclusion, and triggering the `check_suite` webhook with `rerequested` action. IMPORTANT: This endpoint requires GitHub App authentication with 'checks:write' permission. OAuth tokens and classic personal access tokens (PAT) cannot use this endpoint. Only GitHub App user access tokens, GitHub App installation access tokens, or fine-grained personal access tokens with checks:write permission are supported.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
