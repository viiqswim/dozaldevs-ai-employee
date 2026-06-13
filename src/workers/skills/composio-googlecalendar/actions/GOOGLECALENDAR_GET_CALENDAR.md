# GOOGLECALENDAR_GET_CALENDAR

**Description**: Retrieves a specific Google Calendar, identified by `calendar_id`, to which the authenticated user has access. Response includes `timeZone` (IANA format, e.g., 'America/Los_Angeles') — use it directly when constructing `timeMin`/`timeMax` in other tools to avoid DST errors. An empty `defaultReminders` list is valid (no defaults configured). Insufficient `accessRole` may omit fields like `defaultReminders` and `colorId`.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
