# SLACKBOT_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION

**Description**: Retrieves replies to a specific parent message in a Slack conversation, using the channel ID and the parent message's timestamp (`ts`). Note: The parent message in the response contains metadata (reply_count, reply_users, latest_reply) that indicates expected thread activity. If the returned messages array contains fewer replies than reply_count indicates, check: (1) has_more=true means pagination is needed, (2) recently posted replies may have timing delays, (3) some replies may be filtered by permissions or deleted. The composio_execution_message field will warn about any detected mismatches.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
