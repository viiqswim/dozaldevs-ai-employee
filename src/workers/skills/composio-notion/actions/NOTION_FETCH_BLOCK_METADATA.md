# NOTION_FETCH_BLOCK_METADATA

**Description**: Fetches metadata for a Notion block (including pages, which are special blocks) using its UUID. Returns block type, properties, and basic info but not child content. Prerequisites: 1) Block/page must be shared with your integration, 2) Use valid block_id from API responses (not URLs). For child blocks, use fetch_block_contents instead. Common 404 errors mean the block isn't accessible to your integration.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
