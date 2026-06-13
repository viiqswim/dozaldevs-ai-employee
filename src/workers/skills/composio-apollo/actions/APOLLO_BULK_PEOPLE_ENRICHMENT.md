# APOLLO_BULK_PEOPLE_ENRICHMENT

**Description**: Use to enrich multiple person profiles simultaneously with comprehensive data from Apollo's database. Each call consumes Apollo credits; avoid re-enriching the same contacts. Responses may include null or missing fields (e.g., email, phone, organization); treat unmatched records as valid 'no match' outcomes, not errors. Heavy use may trigger HTTP 429; respect Retry-After headers.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
