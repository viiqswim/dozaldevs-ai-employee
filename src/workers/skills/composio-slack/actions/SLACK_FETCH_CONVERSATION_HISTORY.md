# SLACK_FETCH_CONVERSATION_HISTORY

**Description**: Fetches a chronological list of messages and events from a specified Slack conversation, accessible by the authenticated user/bot, with options for pagination and time range filtering. IMPORTANT LIMITATION: This action only returns messages from the main channel timeline. Threaded replies are NOT returned by this endpoint. To retrieve threaded replies, use the SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION action (conversations.replies API) instead. The oldest/latest timestamp filters work reliably for filtering the main channel timeline, but cannot be used to retrieve individual threaded replies - even if you know the exact reply timestamp, setting oldest=latest to that timestamp will return an empty messages array. To get threaded replies: 1. Use this action to get parent messages (which include thread_ts, reply_count, latest_reply fields) 2. Use SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION with the parent's thread_ts to fetch all replies in that thread

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
