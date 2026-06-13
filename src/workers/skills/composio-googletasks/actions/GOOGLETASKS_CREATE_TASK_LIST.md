# GOOGLETASKS_CREATE_TASK_LIST

**Description**: Creates a new task list with the specified title and returns a tasklist_id. Use the returned tasklist_id (not the title) when calling GOOGLETASKS_INSERT_TASK or other task operations. Duplicate titles are permitted by the API, so verify existing lists before creating to avoid unintended duplicates.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
