# QUICKBOOKS_EXECUTE_BATCH_OPERATION

**Description**: Execute multiple QuickBooks operations in a single request. Operations are performed serially. Supports create, update, delete, and query operations on QuickBooks entities. Use this action to reduce network latency when performing multiple operations. Each operation is executed in order, and each response is correlated to its request via the bId field. Maximum 30 operations per batch. Ideal for bulk data operations or related entity updates.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
