# SLACKBOT_LIST_CANVASES

**Description**: DEPRECATED: Use SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK instead (pass types="canvas" for equivalent behavior). Lists Slack Canvases with filtering by channel, user, timestamp, and page-based pagination. Uses Slack's files.list API with types=canvas filter. Only canvases accessible to the authenticated app are returned; missing canvases indicate permissions restrictions, not empty data. Use `paging.pages` in the response to determine total pages; iterate `page` with `count` to retrieve all results. Known limitations: - The 'user' filter may return canvases accessible to the specified user, not just canvases they created. - The 'ts_from' and 'ts_to' timestamp filters may not work reliably for canvas types. Consider client-side filtering on the 'created' field in the response if precise date filtering is required.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
