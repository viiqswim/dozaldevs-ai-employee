# GITHUB_FIND_REPOSITORIES

**Description**: AI-optimized repository search with smart filtering by language, stars, topics, and ownership. Builds intelligent search queries and returns clean, actionable repository data. Check `incomplete_results` in the response — when true, results are non-exhaustive. Search endpoints are rate-limited to ~30 requests/minute (vs. 5000/hour for general REST); apply backoff on 403/429. Total results are capped at ~1000 per query regardless of pagination.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
