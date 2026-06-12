# SLACKBOT_OPEN_DM

**Description**: Opens or resumes a Slack direct message (DM) or multi-person direct message (MPIM) by providing either user IDs or an existing channel ID. Returns `already_open=true` when the DM exists — treat as success and reuse the returned `channel.id` (starts with 'D') for subsequent SLACK_SEND_MESSAGE calls; passing a username, email, or user ID directly to SLACK_SEND_MESSAGE causes `channel_not_found`. Avoid redundant calls when an existing DM channel ID is available.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
