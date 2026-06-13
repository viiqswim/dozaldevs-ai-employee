# FACEBOOK_SEARCH_PAGES

**Description**: Searches for Facebook Pages based on a query string. Returns pages matching the search criteria with requested fields. DEPRECATION WARNING: The /pages/search endpoint was deprecated by Facebook in 2019 and is now ONLY available to Workplace by Meta apps. Standard Facebook apps will receive Error #10 (permission error) regardless of which permissions or features have been granted. For Workplace apps only - requires one of: - 'pages_read_engagement' permission - 'Page Public Content Access' feature - 'Page Public Metadata Access' feature Standard Facebook apps should use alternative methods to discover pages, such as: - Direct page ID lookup via /{page-id} endpoint - User's managed pages via /me/accounts endpoint Reference: https://developers.facebook.com/docs/apps/review/feature#reference-PAGES_ACCESS. Results include only Facebook Pages; personal profiles, groups, and other entity types are excluded.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
