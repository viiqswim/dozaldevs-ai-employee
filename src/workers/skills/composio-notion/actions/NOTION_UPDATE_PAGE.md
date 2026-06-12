# NOTION_UPDATE_PAGE

**Description**: Update page properties, icon, cover, or archive status. IMPORTANT: Property names are workspace-specific and case-sensitive. Use NOTION_FETCH_ROW or NOTION_FETCH_DATABASE first to discover exact property names and valid select/status options. Common errors: - "X is not a property that exists": Discover properties with NOTION_FETCH_ROW - "Invalid status option": Check valid options with NOTION_FETCH_DATABASE - "should be defined": Wrap values: {'Field': {'type': value}} Property formats: title/rich_text use {'text': {'content': 'value'}}, select/status use {'name': 'option'}

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
