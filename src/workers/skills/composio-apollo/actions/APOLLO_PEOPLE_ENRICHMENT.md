# APOLLO_PEOPLE_ENRICHMENT

**Description**: Enriches and retrieves information for a person from Apollo.io. Requires one of: `id`, `email`, `hashed_email`, `linkedin_url`, or (`first_name` and `last_name` with `organization_name` or `domain`) for matching. `webhook_url` must be provided if `reveal_phone_number` is true. Name-only inputs without `organization_name` or `domain` frequently return no matches.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
