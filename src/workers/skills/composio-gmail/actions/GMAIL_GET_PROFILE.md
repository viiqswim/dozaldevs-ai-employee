# GMAIL_GET_PROFILE

**Description**: Retrieves Gmail profile information (email address, aggregate messagesTotal/threadsTotal, historyId) for a user. messagesTotal counts individual emails; threadsTotal counts conversations; neither is per-label — use GMAIL_FETCH_EMAILS with label filters for label-specific counts. The returned historyId seeds incremental sync via GMAIL_LIST_HISTORY; if historyIdTooOld is returned, rescan with GMAIL_FETCH_EMAILS before resuming. Response may be wrapped under a top-level data field; unwrap before reading fields. A successful call confirms mailbox connectivity but not full mailbox access if granted scopes are narrow. Use the returned email address to dynamically identify the authenticated account rather than hard-coding it.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
