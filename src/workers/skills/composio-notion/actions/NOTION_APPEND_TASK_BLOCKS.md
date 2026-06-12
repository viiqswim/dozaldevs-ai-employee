# NOTION_APPEND_TASK_BLOCKS

**Description**: Append task blocks (to-do, toggle, callout) to a Notion page or block. Supported block types: - to_do: Checkbox items (checkable/uncheckable) - toggle: Collapsible sections - callout: Highlighted boxes with emoji icons All three types support nested children (up to 2 levels of nesting). block_id must be a page or block that supports children (e.g., page, toggle, paragraph, list items, quote, callout, to_do). Blocks like divider, breadcrumb, equation do NOT support children. Limits: 2000 chars per text.content, max 100 blocks per request. For other blocks: append_text_blocks, append_code_blocks, append_media_blocks, append_layout_blocks, append_table_blocks.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
