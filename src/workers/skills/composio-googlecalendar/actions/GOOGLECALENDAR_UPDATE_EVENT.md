# GOOGLECALENDAR_UPDATE_EVENT

**Description**: Updates an existing event in Google Calendar. REQUIRES event_id - you MUST first search for the event using GOOGLECALENDAR_FIND_EVENT or GOOGLECALENDAR_EVENTS_LIST to obtain the event_id. This is a full PUT replacement: omitted fields (including attendees, reminders, recurrence, conferencing) are cleared. Always provide the complete desired event state. Use GOOGLECALENDAR_PATCH_EVENT instead for partial edits.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
