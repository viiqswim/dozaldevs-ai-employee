# ONE_DRIVE_ONEDRIVE_LIST_ITEMS

**Description**: Retrieves all files and folders as `driveItem` resources from the root of a specified user's OneDrive, automatically handling pagination. Non-recursive: returns only root-level items; subfolder contents require separate calls. Results may include `remoteItem` pointers (shared items from other drives) — use `remoteItem.driveId` and `remoteItem.id` for those in downstream calls. Distinguish files from folders by presence of `file` or `folder` property. Always use `id` values returned by this tool directly; never construct item IDs manually. Items may be absent from results due to permission restrictions, not drive absence.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
