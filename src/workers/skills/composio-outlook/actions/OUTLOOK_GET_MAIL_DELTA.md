# OUTLOOK_GET_MAIL_DELTA

**Description**: Retrieve incremental changes (delta) of messages in a mailbox. FIRST RUN: Returns ALL messages in folder (use top=50 to limit). Response has @odata.deltaLink. SUBSEQUENT: Pass stored deltaLink to get only NEW/UPDATED/DELETED messages since last sync. Properties available: id, subject, from, receivedDateTime, isRead, etc. NOT available: internetMessageHeaders, full body, attachment content (response size limits).

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
