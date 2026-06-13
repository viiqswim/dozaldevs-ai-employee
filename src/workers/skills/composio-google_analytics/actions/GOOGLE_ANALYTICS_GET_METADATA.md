# GOOGLE_ANALYTICS_GET_METADATA

**Description**: Tool to get metadata for dimensions, metrics, and comparisons for a GA4 property. Use to discover available fields before building a report — always derive dimension/metric apiNames from this output rather than hardcoding from GA4 UI labels, which differ. Available fields vary per property; skip validation and downstream report tools like GOOGLE_ANALYTICS_RUN_REPORT return 400 INVALID_ARGUMENT on incompatible or invalid field combinations. Response can contain hundreds of fields; filter to relevant subset before passing to downstream logic.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
