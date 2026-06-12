# NOTION_UPDATE_ROW_DATABASE

**Description**: Updates a specific row/page within a Notion database by its page UUID (row_id). IMPORTANT CLARIFICATION: This action updates INDIVIDUAL ROWS (pages) in a database, NOT the database structure. - To update a ROW/PAGE: Use THIS action with `row_id` (the page UUID) - To update DATABASE SCHEMA (columns, properties, title): Use NOTION_UPDATE_SCHEMA_DATABASE with `database_id` REQUIRED: `row_id` is MANDATORY. This is the UUID of the specific page/row to update. Do NOT pass `database_id` to this action - that parameter does not exist here. Common issues: (1) Use UUID from page URL, not the full URL (2) Ensure page is shared with integration (3) Match property names exactly as in database (4) Use 'status' type for Status properties, not 'select' (5) Retry on 409 Conflict errors (concurrent updates) Supports updating properties, icon, cover, or archiving the row.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
