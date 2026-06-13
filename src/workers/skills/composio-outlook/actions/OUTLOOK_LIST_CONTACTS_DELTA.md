# OUTLOOK_LIST_CONTACTS_DELTA

**Description**: Retrieve incremental changes (delta) of contacts in a specified folder. Use when syncing contacts without fetching the entire set each time. FIRST RUN: Returns ALL contacts in folder. Response has @odata.deltaLink. SUBSEQUENT: Pass stored deltaLink to get only NEW/UPDATED/DELETED contacts since last sync.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
