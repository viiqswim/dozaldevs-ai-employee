# OUTLOOK_UPDATE_CALENDAR_EVENT

**Description**: Updates specified fields of an existing Outlook calendar event. Implementation note: To avoid unintentionally clearing properties, the action first fetches the existing event, merges only the provided fields, and then PATCHes the merged updates. Unspecified fields remain unchanged.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
