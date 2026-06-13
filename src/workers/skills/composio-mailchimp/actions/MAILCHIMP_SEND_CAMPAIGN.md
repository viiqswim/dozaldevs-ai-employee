# MAILCHIMP_SEND_CAMPAIGN

**Description**: Send a Mailchimp campaign immediately. For RSS Campaigns, the campaign will send according to its schedule. All other campaign types (regular, plaintext, variate) will send immediately upon calling this endpoint. Prerequisites: - Campaign must be in 'save' (draft) status - Campaign must have a valid audience (list_id) with at least one recipient - Campaign must have a subject line, from name, and verified from email address - Campaign must have content (HTML or plain text) - The sending account must be in good standing (verified, not disabled) On success, returns HTTP 204 No Content. The campaign status will change to 'sending' and then 'sent' once all emails are delivered.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
