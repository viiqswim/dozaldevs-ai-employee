# ONE_DRIVE_ONEDRIVE_CREATE_TEXT_FILE

**Description**: Creates a new plain-text file with specified content in the authenticated user's personal OneDrive, using either the folder's unique ID or its absolute path relative to the user's OneDrive root (paths are automatically resolved to IDs); note that OneDrive may rename or create a new version if the filename already exists. All files are written as plain text regardless of extension — specifying .docx or .xlsx does not produce a true Office document. This action only works with the user's personal OneDrive (/me/drive) and does not support SharePoint document libraries or shared drives.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
