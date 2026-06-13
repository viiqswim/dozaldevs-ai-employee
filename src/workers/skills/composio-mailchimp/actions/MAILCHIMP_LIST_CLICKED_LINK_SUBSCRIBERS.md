# MAILCHIMP_LIST_CLICKED_LINK_SUBSCRIBERS

**Description**: Get information about list members who clicked on a specific link in a campaign. This action retrieves all subscribers who clicked on a particular tracked link within a sent campaign, including click counts and subscriber details. Prerequisites: 1. The campaign must have been sent (status='sent') with click tracking enabled 2. The link must exist in the campaign and have been clicked at least once To get the required IDs: 1. campaign_id: Use list_campaigns with status='sent' to find sent campaigns 2. link_id: Use list_campaign_details with the campaign_id to get urls_clicked array Returns empty members array if no subscribers clicked the link.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
