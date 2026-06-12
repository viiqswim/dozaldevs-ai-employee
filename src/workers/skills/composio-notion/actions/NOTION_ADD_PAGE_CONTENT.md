# NOTION_ADD_PAGE_CONTENT

**Description**: DEPRECATED: Use 'add_multiple_page_content' for better performance. Adds a single content block to a Notion page/block. CRITICAL: Notion API enforces a HARD LIMIT of 2000 characters per text.content field. Content exceeding 2000 chars is AUTOMATICALLY SPLIT into multiple sequential blocks. REQUIRED 'content' field for text blocks: paragraph, heading_1-3, callout, to_do, toggle, quote, list items. Parent blocks MUST be: Page, Toggle, To-do, Bulleted/Numbered List Item, Callout, or Quote. Common errors: - "content.length should be ≤ 2000": Text exceeds API limit (should be auto-handled) - "Content is required for paragraph blocks": Missing 'content' field for text blocks - "object_not_found": Invalid parent_block_id or no integration access For bulk operations, use 'add_multiple_page_content' instead.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
