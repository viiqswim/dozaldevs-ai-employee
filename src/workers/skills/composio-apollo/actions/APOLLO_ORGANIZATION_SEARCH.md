# APOLLO_ORGANIZATION_SEARCH

**Description**: Searches Apollo's database for organizations using various filters; consumes credits on every call (unavailable on free plans) — avoid re-running identical queries and surface quota errors rather than retrying. Retrieves a maximum of 50,000 records; uses `page` (1-500) and `per_page` (1-100) for pagination — check `total_pages` in the response to iterate. Overly strict filter combinations can return zero results; start broad and narrow iteratively. Empty results and `org_not_found` are valid outcomes, not errors.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
