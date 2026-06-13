# MAILCHIMP_RESUME_RSS_CAMPAIGN

**Description**: Resume an RSS-Driven campaign that was previously paused. This action restarts the RSS feed delivery schedule for a paused RSS campaign. The campaign will continue checking the RSS feed and sending emails according to its configured schedule. Prerequisites: - Campaign must be of type 'rss' - Campaign must be in 'paused' status (was previously running and then paused) - Use PAUSE_RSS_CAMPAIGN to pause a running RSS campaign first - Use LIST_CAMPAIGNS with type='rss' and status='paused' to find eligible campaigns On success, returns HTTP 204 No Content. The campaign status will change from 'paused' back to 'sending'.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
