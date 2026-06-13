# OUTLOOK_QUERY_EMAILS

**Description**: Query Outlook emails within a SINGLE folder using OData filters. Build precise server-side filters for dates, read status, importance, subjects, attachments, and conversations. Best for structured queries on message metadata within a specific folder. Returns up to 100 messages per request with pagination support. • Searches SINGLE folder only (inbox, sentitems, etc.) - NOT across all folders • For cross-folder/mailbox-wide search: Use OUTLOOK_SEARCH_MESSAGES • Server-side filters: dates, importance, isRead, hasAttachments, subjects, conversationId • CRITICAL: Always check response['@odata.nextLink'] for pagination • Limitations: Recipient/body filtering requires OUTLOOK_SEARCH_MESSAGES

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
