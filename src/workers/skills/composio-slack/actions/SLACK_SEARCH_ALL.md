# SLACK_SEARCH_ALL

**Description**: Tool to search all messages and files. Use when you need unified content search across channels and files in one call. Results are scoped to content visible to the authenticated token; missing hits in private or restricted channels reflect permission/membership gaps. Response separates messages and files into distinct sections — explicitly read the files section for document results. Results are index-based and may lag several minutes behind real-time; use SLACK_FETCH_CONVERSATION_HISTORY for near-real-time per-channel coverage. Paginated searches exceeding ~1 req/sec may return HTTP 429 too_many_requests; honor the Retry-After header and resume from the last page.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
