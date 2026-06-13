# GITHUB_REREQUEST_A_CHECK_RUN

**Description**: Triggers a re-run of a specific check run in a GitHub repository, resetting its status to 'queued', clearing its conclusion, and triggering the `check_run` webhook with `rerequested` action. IMPORTANT: This endpoint requires GitHub App authentication with 'checks:write' permission. The check run can ONLY be re-requested by the same GitHub App that originally created it. OAuth tokens and personal access tokens (PAT) cannot use this endpoint.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
