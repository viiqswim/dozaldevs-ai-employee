# GOOGLECALENDAR_FIND_EVENT

**Description**: Finds events in a specified Google Calendar using text query, time ranges (event start/end, last modification), and event types. Ensure `timeMin` is not chronologically after `timeMax` if both are provided. Results may span multiple pages; always follow `nextPageToken` until absent to avoid silently missing events. Validate the correct match from results by checking summary, start.dateTime, and organizer.email before using event_id for mutations. An empty `items` array means no events matched — widen filters rather than treating it as an error.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
