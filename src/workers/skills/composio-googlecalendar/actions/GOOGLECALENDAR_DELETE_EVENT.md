# GOOGLECALENDAR_DELETE_EVENT

**Description**: Deletes a specified event by `event_id` from a Google Calendar (`calendar_id`); idempotent — a 404 for an already-deleted event is a no-op. Bulk deletions may trigger `rateLimitExceeded` or `userRateLimitExceeded`; cap concurrency to 5–10 requests and apply exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
