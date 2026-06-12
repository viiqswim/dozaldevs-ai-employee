# SLACKBOT_FIND_CHANNELS

**Description**: Find channels in a Slack workspace by any criteria - name, topic, purpose, or description. Returns channel IDs (C*/G* prefixed) required by most Slack tools — always resolve names to IDs here before passing to other tools. NOTE: This action searches channels and conversations visible to the authenticated user. Empty results may indicate: - No channels match the search query in name, topic, or purpose - The target private channel or DM is not accessible to the authenticated user because they are not a member - The connection lacks required read scopes (channels:read, groups:read, im:read, mpim:read). If empty, retry with exact_match=false or exclude_archived=false to avoid false negatives. In large workspaces, paginate using next_cursor to avoid missing matches. Check 'composio_execution_message' and 'total_channels_searched' in the response for details.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
