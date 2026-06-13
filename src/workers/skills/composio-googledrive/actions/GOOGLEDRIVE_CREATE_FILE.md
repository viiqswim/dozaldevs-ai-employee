# GOOGLEDRIVE_CREATE_FILE

**Description**: Creates a new file or folder in Google Drive. Supports both metadata-only creation (for folders and empty documents) and file upload with content. When file_to_upload is provided, uploads the actual file bytes; otherwise creates an empty file. Native Google file types (Docs, Sheets, Forms, etc.) and folders are created as empty shells when no content is provided; content must be added manually afterward. Newly created files are private by default — set sharing permissions afterward for collaboration. For shared-drive folders, use this tool with the target folder ID in `parents` rather than GOOGLEDRIVE_CREATE_FOLDER.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
