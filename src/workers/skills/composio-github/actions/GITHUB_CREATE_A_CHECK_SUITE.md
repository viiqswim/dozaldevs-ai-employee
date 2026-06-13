# GITHUB_CREATE_A_CHECK_SUITE

**Description**: Creates a new check suite for a specific commit (`head_sha`) in an original repository (not a fork). IMPORTANT: This endpoint requires a GitHub App installation access token - OAuth tokens and classic personal access tokens cannot use this endpoint. GitHub dispatches a `check_suite` webhook event with the `requested` action upon success.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
