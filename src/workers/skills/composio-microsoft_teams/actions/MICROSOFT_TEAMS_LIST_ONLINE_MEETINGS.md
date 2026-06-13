# MICROSOFT_TEAMS_LIST_ONLINE_MEETINGS

**Description**: Look up a Microsoft Teams online meeting for a user by identifier. This is effectively a 'lookup-by-identifier' endpoint, NOT a general-purpose list or search. Microsoft Graph REQUIRES an OData $filter predicate on /me/onlineMeetings and /users/{user_id}/onlineMeetings; without it the API returns HTTP 400 'Filter expression expected'. The only supported filter properties on this endpoint are JoinWebUrl and joinMeetingIdSettings/joinMeetingId (e.g. "JoinWebUrl eq 'https://teams.microsoft.com/l/meetup-join/...'" or "joinMeetingIdSettings/joinMeetingId eq '1234567890'"). subject and VideoTeleconferenceId are NOT supported here. If you already know the meeting id, prefer MICROSOFT_TEAMS_USERS_GET_ONLINE_MEETING. There is no Graph API for free-text searching a user's meetings by title.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
