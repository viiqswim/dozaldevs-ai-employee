# MAILCHIMP_START_AUTOMATED_EMAIL

**Description**: Start a specific automated email within an Automation workflow. This action starts sending a specific automated email that is part of a classic automation workflow. The email must be in a 'paused' status to be started. Emails in 'save' (draft) status may need additional configuration in the Mailchimp web interface before they can be started. Prerequisites: - The automation workflow must exist and not be archived - The automated email must be properly configured (subject line, content, etc.) - The email should be in 'paused' status (use Pause Automated Email first if needed) Common error responses: - 400: The automation email is missing requirements and can't be started - 404: The workflow_id or workflow_email_id was not found

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
