# GOOGLECALENDAR_SYNC_EVENTS

**Description**: DEPRECATED: Use GOOGLECALENDAR_EVENTS_LIST instead. EventsList already handles syncToken with automatic param stripping. Synchronizes Google Calendar events, performing a full sync if no `sync_token` is provided or if a 410 GONE error (due to an expired token) necessitates it, otherwise performs an incremental sync for events changed since the `sync_token` was issued.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
