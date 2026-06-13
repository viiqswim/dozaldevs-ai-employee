# GOOGLECALENDAR_FIND_FREE_SLOTS

**Description**: Finds both free and busy time slots in Google Calendars for specified calendars within a defined time range. If `time_min` is not provided, defaults to the current timestamp in the specified timezone. If `time_max` is not provided, defaults to 23:59:59 of the day specified in `time_min` (if provided), otherwise defaults to 23:59:59 of the current day in the specified timezone. Returns busy intervals and calculates free slots by finding gaps between busy periods; `time_min` must precede `time_max` if both are provided. This action retrieves free and busy time slots for the specified calendars over a given time period. It analyzes the busy intervals from the calendars and provides calculated free slots based on the gaps in the busy periods. Returned free slots are unfiltered by duration; callers must filter intervals to those fully containing the required meeting length. No event metadata (titles, descriptions, links) is returned; use GOOGLECALENDAR_EVENTS_LIST for event details.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
