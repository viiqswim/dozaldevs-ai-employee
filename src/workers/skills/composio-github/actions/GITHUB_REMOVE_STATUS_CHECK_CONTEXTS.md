# GITHUB_REMOVE_STATUS_CHECK_CONTEXTS

**Description**: Removes specified status check contexts from a protected branch's required status checks. This action removes the specified status check contexts from the existing list of required status checks for a protected branch. The branch must already have branch protection enabled with status checks configured. Note: The 'contexts' parameter is deprecated by GitHub in favor of 'checks' array. For new implementations, consider using update_status_check_protection with the 'checks' parameter instead.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
