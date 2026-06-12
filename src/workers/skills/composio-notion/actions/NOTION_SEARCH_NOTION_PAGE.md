# NOTION_SEARCH_NOTION_PAGE

**Description**: Searches Notion pages and databases by title. Use specific search terms to find items by title (primary approach). KNOWN LIMITATIONS: (1) Search indexing is not immediate - recently shared items may not appear. (2) Search is not exhaustive - results may be incomplete. (3) Database pages return all custom properties with full nested structures, which can create large responses for databases with many properties - use filter_properties to reduce response size. FALLBACK STRATEGY: If a specific title search returns empty results despite knowing items exist, try an empty query to list all accessible items and filter client-side.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
