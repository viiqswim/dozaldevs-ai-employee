# GOOGLEDRIVE_UPDATE_FILE_PUT

**Description**: Updates file metadata. Uses PATCH semantics (partial update) as per Google Drive API v3 — only explicitly provided fields are updated, so omit fields you do not intend to overwrite. Use this tool to modify attributes of an existing file like its name, description, or parent folders. To move a file, supply add_parents and remove_parents together; omitting remove_parents creates multiple parents, omitting add_parents can orphan the file. Bulk updates may trigger 429 Too Many Requests; apply exponential backoff. Note: supports metadata updates only; file content updates are not yet implemented.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
