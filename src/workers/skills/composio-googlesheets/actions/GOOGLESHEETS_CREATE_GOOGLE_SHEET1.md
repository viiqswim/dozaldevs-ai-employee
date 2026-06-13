# GOOGLESHEETS_CREATE_GOOGLE_SHEET1

**Description**: Creates a new Google Spreadsheet in Google Drive. If a title is provided, the spreadsheet will be created with that name. If no title is provided, Google will create a spreadsheet with a default name like 'Untitled spreadsheet'. Optionally create the spreadsheet in a specific folder by providing either: - folder_id: The Google Drive folder ID (preferred, unambiguous) - folder_name: The folder name (searches for exact match; if multiple folders match, returns choices) If neither folder_id nor folder_name is provided, the spreadsheet is created in the root Drive folder.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
