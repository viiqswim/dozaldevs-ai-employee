# NOTION_REPLACE_PAGE_CONTENT

**Description**: Safely replaces a page's child blocks by optionally backing up current content, deleting existing children, then appending new children in batches. Use when you need to rebuild a page without leaving partial states. Notion does not provide atomic transactions; this tool orchestrates a multi-step workflow with optional backup to reduce risk.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
