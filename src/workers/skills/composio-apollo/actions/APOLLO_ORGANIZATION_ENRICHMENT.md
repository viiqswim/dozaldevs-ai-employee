# APOLLO_ORGANIZATION_ENRICHMENT

**Description**: Fetches comprehensive organization enrichment data from Apollo.io for a given company domain; results are most meaningful if the company exists in Apollo's database. Each call consumes Apollo credits and may be unavailable on free plans. Returns HTTP 429 under burst usage; use exponential backoff on retries.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
