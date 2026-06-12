# GMAIL_FETCH_MESSAGE_BY_THREAD_ID

**Description**: Retrieves messages from a Gmail thread using its `thread_id`, where the thread must be accessible by the specified `user_id`. Returns a `messages` array; `thread_id` is not echoed in the response. Message order is not guaranteed — sort by `internalDate` to find oldest/newest. Check `labelIds` per message to filter drafts. Concurrent bulk calls may trigger 403 `userRateLimitExceeded` or 429; cap concurrency ~10 and use exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
