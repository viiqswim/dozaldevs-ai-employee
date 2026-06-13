# GITHUB_SEARCH_CODE_ALL_PAGES

**Description**: Tool to search code across multiple pages using GitHub's code search API. Use when single-page searches may miss matches and you need a full or capped result set. GitHub caps results at ~1,000 total items regardless of pagination; results for broad queries may be silently truncated. Only the default branch is indexed, and very large files may be excluded — treat results as potentially partial. Rate limit: ~30 requests/minute; honor `Retry-After` on 403/429 responses.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
