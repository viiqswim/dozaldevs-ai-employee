# NOTION_QUERY_DATABASE

**Description**: Queries a Notion database to retrieve pages (rows). In Notion, databases are collections where each row is a page and columns are properties. Returns paginated results with metadata. Important requirements: - The database must be shared with your integration - Property names in sorts must match existing database properties exactly (case-sensitive) - For timestamp sorting, use 'created_time' or 'last_edited_time' (case-insensitive) - The start_cursor must be a valid UUID from a previous response's next_cursor field - Database IDs must be valid 32-character UUIDs (with or without hyphens) Use this action to: - Retrieve all or filtered database entries - Sort results by database properties or page timestamps - Paginate through large result sets - Get database content for processing or display

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
