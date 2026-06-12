# NOTION_ADD_MULTIPLE_PAGE_CONTENT

**Description**: Bulk-add content blocks to Notion. Text >2000 chars auto-splits. Parses markdown formatting. ⚠️ PARENT BLOCK TYPES: Content is added AS CHILDREN of parent_block_id. - To add content AFTER a heading, use PAGE ID as parent + heading ID in 'after' param. - Headings CANNOT have children unless is_toggleable=True. Simplified format: {'content': 'text', 'block_property': 'paragraph'} Full format for code: {'type': 'code', 'code': {'rich_text': [...], 'language': 'python'}} Array format also supported (auto-normalized): [{"parent_block_id": "..."}, {block1}, {block2}] => proper request structure

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
