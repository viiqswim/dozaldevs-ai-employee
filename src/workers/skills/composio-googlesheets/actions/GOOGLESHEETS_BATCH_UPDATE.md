# GOOGLESHEETS_BATCH_UPDATE

**Description**: DEPRECATED: Use GOOGLESHEETS_VALUES_UPDATE instead. Write values to ONE range in a Google Sheet, or append as new rows if no start cell is given. IMPORTANT - This tool does NOT accept the Google Sheets API's native batch format: - WRONG: {"data": [{"range": "...", "values": [[...]]}], ...} - CORRECT: {"sheet_name": "...", "values": [[...]], "first_cell_location": "...", ...} To update MULTIPLE ranges, make SEPARATE CALLS to this tool for each range. Features: - Auto-expands grid for large datasets (prevents range errors) - Set first_cell_location to write at a specific position (e.g., "A1", "B5") - Omit first_cell_location to append values as new rows at the end Requirements: Target sheet must exist and spreadsheet must contain at least one worksheet.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
| additionalProperties | unknown | No |  |
