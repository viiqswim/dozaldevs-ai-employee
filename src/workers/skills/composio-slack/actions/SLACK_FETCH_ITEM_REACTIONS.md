# SLACK_FETCH_ITEM_REACTIONS

**Description**: Fetches reactions for a Slack message, file, or file comment. Exactly one identifier path must be provided: `channel`+`timestamp`, `file`, or `file_comment`. Mixing identifiers (e.g., providing both `channel`+`timestamp` and `file`) causes errors. If the response omits the `reactions` field, the item has zero reactions.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
