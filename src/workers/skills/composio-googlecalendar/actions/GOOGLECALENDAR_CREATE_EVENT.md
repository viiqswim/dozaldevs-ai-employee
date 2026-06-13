# GOOGLECALENDAR_CREATE_EVENT

**Description**: Create a Google Calendar event using start_datetime plus duration fields. The organizer is added as an attendee unless exclude_organizer is True. By default adds Google Meet link (works for Workspace, gracefully falls back for personal Gmail). Attendees can be email strings (required) or objects with email and optional fields. No conflict checking is performed; use GOOGLECALENDAR_FREE_BUSY_QUERY to detect overlaps before creating. Returns event id and htmlLink nested under data.response_data. Example: { "start_datetime": "2025-01-16T13:00:00", "timezone": "America/New_York", "event_duration_hour": 1, "event_duration_minutes": 30, "summary": "Client sync", "attendees": ["required@example.com", {"email": "optional@example.com", "optional": true}] }

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
