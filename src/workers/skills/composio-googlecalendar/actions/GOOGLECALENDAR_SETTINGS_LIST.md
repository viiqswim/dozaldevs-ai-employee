# GOOGLECALENDAR_SETTINGS_LIST

**Description**: Returns all user settings for the authenticated user. Results include multiple settings keyed by id (e.g., `timeZone`); locate a specific setting by its `id` field. `timeZone` values are IANA identifiers (e.g., `America/New_York`) — use directly in datetime and event logic; align with `timeZone` from GOOGLECALENDAR_GET_CALENDAR for consistent notification times.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
