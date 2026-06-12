# SLACK_LIST_CONVERSATIONS

**Description**: List conversations (channels/DMs) accessible to a specified user (or the authenticated user if no user ID is provided), respecting shared membership for non-public channels. Returns conversation IDs (C* for channels, G* for group DMs), not display names. Absence of private channels, DMs, or MPIMs from results indicates token scope or membership limits, not that the conversation is nonexistent.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
