# APOLLO_GET_AUTH_STATUS

**Description**: Tool to check whether the provided Apollo API key is valid and accepted by Apollo (health/auth check). Use when any Apollo endpoint returns 401/403/422 to quickly diagnose invalid/expired keys versus permission scope issues. If this succeeds but other endpoints return 403, it strongly suggests permissioning or master-key scope issues rather than a totally invalid credential.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
