# GOOGLEDRIVE_CREATE_FOLDER

**Description**: Creates a new folder in Google Drive, optionally within an EXISTING parent folder specified by its ID or name. The parent folder MUST already exist - use GOOGLEDRIVE_FIND_FOLDER first to verify the parent exists or find its ID. Google Drive permits duplicate folder names, so always store and reuse the folder ID returned by this action rather than relying on names for future lookups.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
