# GOOGLETASKS_BATCH_EXECUTE

**Description**: Executes multiple Google Tasks API operations in a single HTTP batch request and returns structured per-item results. Use this to reduce LLM tool invocations when performing bulk operations like updating many tasks, moving tasks, or deleting multiple items. Note: Each sub-request still counts toward API quota; batching primarily reduces HTTP overhead and tool call count.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
