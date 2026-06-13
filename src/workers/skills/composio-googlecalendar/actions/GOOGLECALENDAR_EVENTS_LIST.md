# GOOGLECALENDAR_EVENTS_LIST

**Description**: Returns events on the specified calendar. TIMEZONE WARNING: When using timeMin/timeMax with UTC timestamps (ending in 'Z'), the time window is interpreted in UTC regardless of the calendar's timezone. For example, querying '2026-01-19T00:00:00Z' to '2026-01-20T00:00:00Z' on a calendar in America/Los_Angeles (UTC-8) covers 2026-01-18 4pm to 2026-01-19 4pm local time, potentially missing events on the intended local date. To query for a specific local date, use timestamps with the appropriate timezone offset in timeMin/timeMax (e.g., '2026-01-19T00:00:00-08:00' for PST).

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
