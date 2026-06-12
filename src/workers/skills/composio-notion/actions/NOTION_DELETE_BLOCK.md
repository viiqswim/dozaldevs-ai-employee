# NOTION_DELETE_BLOCK

**Description**: Archives a Notion block, page, or database using its ID, which sets its 'archived' property to true (like moving to "Trash" in the UI) and allows it to be restored later. Note: This operation will fail if the block has an archived parent or ancestor in the hierarchy. You must unarchive the ancestor before archiving/deleting its descendants. IMPORTANT LIMITATION: Workspace-level pages (top-level pages that are direct children of the workspace, not contained within other pages or databases) cannot be archived via the Notion API. This is a documented Notion API restriction. Only pages that are children of other pages or databases can be deleted through this action.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
