# APOLLO_PEOPLE_SEARCH

**Description**: Searches Apollo's contact database for people using various filters; results capped at 50,000 records and does not enrich contact data. Combining multiple strict filters (organization_ids, person_titles, person_seniorities) can return zero results — start broad and narrow iteratively. Result records may have null email, phone, or organization fields.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
