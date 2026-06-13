# GITHUB_LIST_PROJECT_CARDS

**Description**: Lists all project cards for a given column_id in GitHub Projects (classic). DEPRECATION NOTICE: GitHub Projects (classic) and its REST API were sunset on April 1, 2025. This action will return 404 for most requests on GitHub.com. However, it may still work on GitHub Enterprise Server instances where classic projects are enabled. For new projects, use GitHub Projects V2 which uses the GraphQL API instead. See: https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/ Returns a list of project cards including: id, node_id, url, note (or null for linked cards), creator info, content_url (for issue/PR cards), column_url, project_url, timestamps, and archived status.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
