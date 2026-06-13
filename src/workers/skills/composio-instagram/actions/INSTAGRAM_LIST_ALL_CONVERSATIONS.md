# INSTAGRAM_LIST_ALL_CONVERSATIONS

**Description**: List all Instagram DM conversations for the authenticated user. Requires a Business/Creator account with messaging permissions; personal accounts return empty results. Response conversations are nested under `data.data` — accessing top-level `data` as the final list returns zero items. An empty `data` list is a valid non-error outcome meaning no conversations exist in scope.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
