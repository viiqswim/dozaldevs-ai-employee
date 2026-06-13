# MAILCHIMP_PAUSE_AUTOMATED_EMAIL

**Description**: Pause a specific automated email within a classic automation workflow. This action pauses the sending of a specific automated email. The email must currently be in 'sending' (active) status. Use the start_automated_email action to resume a paused email. Prerequisites: - The automation workflow must exist - The email within the workflow must be in 'sending' status (not 'save' or 'paused') Common errors: - 400 Bad Request: Email is already paused or in draft state - 404 Not Found: Invalid workflow_id or workflow_email_id

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
