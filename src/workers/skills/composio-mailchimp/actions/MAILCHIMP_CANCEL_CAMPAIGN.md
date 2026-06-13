# MAILCHIMP_CANCEL_CAMPAIGN

**Description**: Cancel a Regular or Plain-Text Campaign after you send, before all of your recipients receive it. This feature requires Mailchimp Pro or Premium plan. IMPORTANT: This action can only be used on campaigns that are currently in the 'sending' status. It cannot be used on: - Draft campaigns (status: 'save') - Scheduled campaigns (status: 'schedule') - use Unschedule Campaign instead - Already sent campaigns (status: 'sent') - Paused campaigns (status: 'paused') When successful, the campaign status will change to 'canceling' and then 'canceled'. Any recipients who have already received the email will not be affected. Returns HTTP 204 No Content on success. Returns HTTP 402 Payment Required if account lacks Mailchimp Pro/Premium subscription. Returns HTTP 404 Not Found if campaign_id is invalid.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
