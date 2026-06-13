# MAILCHIMP_GET_CLICKED_LINK_SUBSCRIBER

**Description**: Get detailed information about a specific subscriber who clicked a link in a campaign. This action retrieves click data for a specific list member who clicked on a particular tracked link in a sent campaign. Use this to understand individual subscriber engagement with campaign links. Prerequisites: - The campaign must have been sent (status: 'sent') - The link must be a tracked link in the campaign - The subscriber must have clicked the link at least once To get the required IDs: 1. campaign_id: Use list_campaigns with status='sent' 2. link_id: Use list_campaign_details with the campaign_id to get urls_clicked 3. subscriber_hash: Use list_clicked_link_subscribers to get email_id of clickers

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
