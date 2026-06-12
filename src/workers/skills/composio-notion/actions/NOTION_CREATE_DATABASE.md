# NOTION_CREATE_DATABASE

**Description**: Creates a new Notion database as a subpage under a specified parent page with a defined properties schema. IMPORTANT NOTES: - The parent page MUST be shared with your integration, otherwise you'll get a 404 error - If you encounter conflict errors (409), retry the request as Notion may experience temporary save conflicts - For relation properties, you MUST provide the database_id of the related database - Parent ID must be a valid UUID format (with or without hyphens), not a template variable Use this action exclusively for creating new databases.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
