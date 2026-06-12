# NOTION_CREATE_NOTION_PAGE

**Description**: Creates a new page in a Notion workspace under a specified parent page or database. Supports creating pages with markdown content using the native markdown parameter, or as an empty page that can be populated later. PREREQUISITES: - Parent page/database must exist and be accessible in your Notion workspace - Use search_pages or list_databases first to obtain valid parent IDs LIMITATIONS: - Cannot create root-level pages (must have a parent) - May encounter conflicts if creating pages too quickly - Title-based parent search is less reliable than using UUIDs - The markdown parameter is mutually exclusive with children/content parameters

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
