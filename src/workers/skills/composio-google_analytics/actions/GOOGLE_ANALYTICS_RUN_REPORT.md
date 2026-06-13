# GOOGLE_ANALYTICS_RUN_REPORT

**Description**: Tool to run a customized GA4 data report. Use when you need event data after specifying dimensions, metrics, and date ranges. IMPORTANT - DIMENSION/METRIC COMPATIBILITY: The Google Analytics Data API has strict compatibility rules between dimensions and metrics. Not all combinations are valid. If you receive a 400 error with a message about incompatible dimensions/metrics, use the GOOGLE_ANALYTICS_CHECK_COMPATIBILITY action first to validate your dimension/metric combinations before running reports. Common incompatibilities include: - Demographic dimensions (userAgeBracket, userGender) with session-scoped dimensions/filters (sessionCampaignName, sessionSource) - Certain user-scoped dimensions with event-scoped metrics For complex queries, consider starting with simpler dimension/metric combinations or use CHECK_COMPATIBILITY to pre-validate your request.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
