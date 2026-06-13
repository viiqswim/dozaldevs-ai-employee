# GOOGLESHEETS_ADD_SHEET

**Description**: Adds a new sheet to a spreadsheet. Supports three sheet types: GRID, OBJECT, and DATA_SOURCE. SHEET TYPES: - GRID (default): Standard spreadsheet with rows/columns. Use properties to set dimensions, tab color, etc. - OBJECT: Sheet containing a chart. Requires objectSheetConfig with chartSpec (basicChart or pieChart). - DATA_SOURCE: Sheet connected to BigQuery. Requires dataSourceConfig with bigQuery spec and bigquery.readonly OAuth scope. OTHER NOTES: - Sheet names must be unique; use forceUnique=true to auto-append suffix (_2, _3) if name exists - For tab colors, use EITHER rgbColor OR themeColor, not both - Avoid 'index' when creating sheets in parallel (causes errors) - OBJECT sheets are created via addChart with position.newSheet=true - DATA_SOURCE sheets require bigquery.readonly OAuth scope Use cases: Add standard grid sheet, create chart on dedicated sheet, connect to BigQuery data source.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
