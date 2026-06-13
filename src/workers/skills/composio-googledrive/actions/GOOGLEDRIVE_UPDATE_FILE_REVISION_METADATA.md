# GOOGLEDRIVE_UPDATE_FILE_REVISION_METADATA

**Description**: Updates ONLY the metadata properties of a specific file revision (keepForever, published, publishAuto, publishedOutsideDomain). IMPORTANT: This action does NOT update file content. To update file content, use EDIT_FILE or UPDATE_FILE_PUT instead. This action requires BOTH file_id AND revision_id parameters. Use LIST_REVISIONS to get available revision IDs for a file. Valid parameters: file_id (required), revision_id (required), keep_forever, published, publish_auto, published_outside_domain. Invalid parameters (use other actions): file_contents, mime_type, content, name - these are NOT supported by this action.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
