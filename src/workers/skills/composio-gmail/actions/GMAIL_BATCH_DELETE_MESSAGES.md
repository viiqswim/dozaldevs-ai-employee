# GMAIL_BATCH_DELETE_MESSAGES

**Description**: Tool to permanently delete multiple Gmail messages in bulk, bypassing Trash with no recovery possible. Use when you need to efficiently remove large numbers of emails (e.g., retention enforcement, mailbox hygiene). Use GMAIL_MOVE_TO_TRASH instead when reversibility may be needed. Always obtain explicit user confirmation and verify a sample of message IDs before executing. High-volume calls may trigger 429 rateLimitExceeded or 403 userRateLimitExceeded errors; apply exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
