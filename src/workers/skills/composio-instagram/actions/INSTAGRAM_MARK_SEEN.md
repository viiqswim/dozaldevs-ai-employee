# INSTAGRAM_MARK_SEEN

**Description**: Mark Instagram DM messages as read/seen for a specific user. Sends a 'mark_seen' sender action to indicate messages from the specified recipient have been read. Marking as seen is visible to the other party and changes inbox read state — use with explicit user approval in automated or bulk flows. IMPORTANT LIMITATIONS: - The sender_action API feature may have limited support on Instagram - The recipient must have an active 24-hour messaging window open - Requires instagram_manage_messages permission - Only works with Instagram Business or Creator accounts If this action fails with a 500 error, it may indicate that the sender_action feature is not supported for your Instagram account or the specific recipient.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
