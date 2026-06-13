# GITHUB_DOWNLOAD_A_REPOSITORY_ARCHIVE_ZIP

**Description**: Downloads a repository's source code as a ZIP archive for a specific Git reference (branch, tag, or commit SHA). IMPORTANT SIZE LIMITATION: This action may fail with 'payload too large' errors for large repositories due to platform size restrictions. If you encounter size limit issues, consider these alternatives: - Use GITHUB_GET_REPOSITORY_CONTENT to fetch specific files or directories (also lists directory contents) - Clone the repository using git if you need the full codebase Best suited for: small to medium repositories, downloading specific tagged releases, or quick code inspection.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
