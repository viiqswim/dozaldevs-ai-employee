# GITHUB_FIND_PULL_REQUESTS

**Description**: Primary tool to find and search pull requests. Supports filtering by repository, author, state, labels, and merge status, and returns structured PR data for reliable use in workflows. GitHub search results are capped at ~1000 total items; narrow filters when totals approach this limit. `created_since`/`updated_since` filter on creation/update timestamps, not `merged_at`; apply merge-date filtering client-side.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
