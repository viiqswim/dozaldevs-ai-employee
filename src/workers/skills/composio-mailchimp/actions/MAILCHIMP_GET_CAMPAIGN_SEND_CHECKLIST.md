# MAILCHIMP_GET_CAMPAIGN_SEND_CHECKLIST

**Description**: Review the send checklist for a Mailchimp campaign before sending. Returns a list of checklist items indicating issues that need to be resolved. Each item has a 'type' field: 'error' (must fix before sending), 'warning' (optional but recommended to address), or 'success' (item is complete). The 'is_ready' field indicates if the campaign can be sent (True when no errors). Common checklist items include: audience selection, subject line, from name/email, email content, and tracking settings.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
