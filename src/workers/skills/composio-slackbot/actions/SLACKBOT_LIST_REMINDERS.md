# SLACKBOT_LIST_REMINDERS

**Description**: Lists all reminders with their details for the authenticated Slack user; returns an empty array if no reminders exist (valid state, not an error). Reminder text is not unique—perform client-side matching on returned objects before extracting a reminder ID for use with SLACK_DELETE_A_SLACK_REMINDER.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
