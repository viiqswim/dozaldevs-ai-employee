# NOTION_UPDATE_SCHEMA_DATABASE

**Description**: Updates an existing Notion database's schema including title, description, and/or properties (columns). IMPORTANT NOTES: - At least one update (title, description, or properties) must be provided - The database must be shared with your integration - Property names are case-sensitive and must match exactly - When changing a property to 'relation' type, you MUST provide the database_id of the target database - Removing properties will permanently delete that column and its data - Use NOTION_FETCH_DATA first to get the exact property names and database structure Common errors: - 'database_id' missing: Ensure you're passing the database_id parameter (not page_id) - 'data_source_id' undefined: When changing to relation type, database_id is required in PropertySchemaUpdate - Property name mismatch: Names must match exactly including case and special characters

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
