# NOTION_APPEND_LAYOUT_BLOCKS

**Description**: Append layout blocks (divider, TOC, breadcrumb, columns) to a Notion page. Supported types: - divider: Horizontal line separator - table_of_contents: Auto-generated from headings - breadcrumb: Page hierarchy navigation - column_list: Multi-column layout (requires 2+ columns, each with 1+ child block) For multi-column layouts, create column_list with column children in one request. Each column must contain at least 1 child block. For other blocks, use: append_text_blocks, append_task_blocks, append_code_blocks, append_media_blocks, or append_table_blocks.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
