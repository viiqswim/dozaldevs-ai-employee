# GMAIL_GET_CONTACTS

**Description**: Fetches contacts (connections) for the authenticated Google account, allowing selection of specific data fields and pagination. Only covers saved contacts and 'Other Contacts'; email-header-only senders are out of scope. Contact records may have sparse data — handle missing fields gracefully. People API shares a per-user QPS quota; HTTP 429 requires exponential backoff (1s, 2s, 4s).

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
