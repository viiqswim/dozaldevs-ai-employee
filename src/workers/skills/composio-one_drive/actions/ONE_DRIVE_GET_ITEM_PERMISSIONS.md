# ONE_DRIVE_GET_ITEM_PERMISSIONS

**Description**: Retrieves the permissions of a DriveItem by its unique ID within a specific Drive. Use when you need to check who has access to a file or folder and what level of access they have. Response nests permission entries under `data.value`; check top-level `success`/`error` flags before processing results. Results include inherited permissions, owner entries, and anonymous link entries — not just explicitly granted permissions. Sharing links may have differing scopes (org-only vs. anonymous); verify `link.scope` before treating a permission as externally accessible.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
