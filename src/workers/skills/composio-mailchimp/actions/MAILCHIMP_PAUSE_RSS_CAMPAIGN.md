# MAILCHIMP_PAUSE_RSS_CAMPAIGN

**Description**: Pause an RSS-Driven campaign that is currently sending. This action pauses an active RSS campaign, stopping it from sending new emails based on its schedule until it is resumed. Only campaigns of type 'rss' that are currently in 'sending' status can be paused. Prerequisites: - The campaign must be of type 'rss' (not 'regular', 'plaintext', etc.) - The campaign must be in 'sending' status (actively running according to schedule) - Campaigns in 'save', 'paused', or 'sent' status cannot be paused Use RESUME_RSS_CAMPAIGN to resume a paused RSS campaign. Use LIST_CAMPAIGNS with type='rss' to find RSS campaigns.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
