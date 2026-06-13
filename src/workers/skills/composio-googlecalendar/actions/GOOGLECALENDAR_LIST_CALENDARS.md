# GOOGLECALENDAR_LIST_CALENDARS

**Description**: Retrieves calendars from the user's Google Calendar list, with options for pagination and filtering. Loop through all pages using nextPageToken until absent to avoid missing calendars. Use the primary flag and accessRole field from the response to identify calendars — display names are not valid calendar_id values. Read access (listing) does not imply write OAuth scopes.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
