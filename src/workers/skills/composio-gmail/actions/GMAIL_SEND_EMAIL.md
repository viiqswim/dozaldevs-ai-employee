# GMAIL_SEND_EMAIL

**Description**: Sends an email via Gmail API using the authenticated user's Google profile display name. Sends immediately and is irreversible — confirm recipients, subject, body, and attachments before calling. At least one of 'to' (or 'recipient_email'), 'cc', or 'bcc' must be provided. At least one of subject or body must be provided. Requires `is_html=True` if the body contains HTML. All common file types including PNG, JPG, PDF, MP4, etc. are supported as attachments. Gmail API limits total message size to ~25 MB after base64 encoding. To reply in an existing thread, use GMAIL_REPLY_TO_THREAD instead. No scheduled send support; enforce timing externally.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
