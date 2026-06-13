# ONE_DRIVE_SEARCH_ITEMS

**Description**: Search OneDrive for files and folders by keyword. Searches filenames, metadata, and file content to find matching items. Use when you need to find specific files based on keywords, file types, or content. Supports filtering, sorting, and pagination. Results are mixed files and folders — filter client-side using file vs folder properties. Disambiguate similarly named items using parentReference.path, lastModifiedDateTime, and size before passing item IDs downstream. Newly created or recently moved files may not appear due to indexing delays; fall back to ONE_DRIVE_LIST_FOLDER_CHILDREN if expected items are missing. No server-side date filtering — apply lastModifiedDateTime/createdDateTime filtering in your own logic. HTTP 429 responses include a Retry-After header; use exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
