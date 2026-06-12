# NOTION_INSERT_ROW_DATABASE

**Description**: Creates a new page (row) in a specified Notion database. Prerequisites: - Database must be shared with your integration - Property names AND types must match schema exactly (case-sensitive) - Use NOTION_FETCH_DATA with fetch_type='databases' first to get exact property names and types - Each database has ONE 'title' property; other text fields are 'rich_text' - Database must NOT have multiple data sources (synced databases are not supported) Common Errors: - 404: Database not shared with integration - 400 "not a property": Wrong property name - 400 "expected to be X": Wrong property type - 400 "multiple_data_sources": Database uses multiple data sources (not supported) Note: Rich text content in child_blocks is automatically truncated to 2000 characters per Notion API limits.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| additionalProperties | unknown | No |  |
