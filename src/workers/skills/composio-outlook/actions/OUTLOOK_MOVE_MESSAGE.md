# OUTLOOK_MOVE_MESSAGE

**Description**: Move a message to another folder within the specified user's mailbox. Creates a new copy in the destination folder and removes the original. The message_id changes after a successful move; use the ID returned in the response for any subsequent operations on the moved message. High-volume parallel moves can trigger HTTP 429 (MailboxConcurrency) throttling; honor the Retry-After header.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
