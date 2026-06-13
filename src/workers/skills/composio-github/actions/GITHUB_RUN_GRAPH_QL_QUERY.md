# GITHUB_RUN_GRAPH_QL_QUERY

**Description**: Tool to run an arbitrary GitHub GraphQL v4 query or mutation. Use when fetching multiple datasets in one batch. Cost-based rate limit: ~5,000 points/hour; keep field selections narrow, avoid deep nesting, and include rateLimit in responses to monitor quota. Responses are nested under data.data (e.g., data.data.repository.vulnerabilityAlerts); always inspect the errors array even on HTTP 200, as partial failures embed there. Paginate by looping on pageInfo.hasNextPage and advancing with pageInfo.endCursor. Search results cap at ~1,000 items per query; split by label, date range, or repository for full coverage. Use ProjectV2 nodes, not Classic Projects (deprecated). Parallel mutations (e.g., addProjectV2ItemById) can trigger transient conflicts; use sequential execution.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
