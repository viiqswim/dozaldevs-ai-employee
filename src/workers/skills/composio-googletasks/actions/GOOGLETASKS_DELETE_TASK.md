# GOOGLETASKS_DELETE_TASK

**Description**: Deletes a specified task from a Google Tasks list. Deletion is permanent and irreversible — confirm with the user before executing, and consider GOOGLETASKS_UPDATE_TASK or GOOGLETASKS_MOVE_TASK as non-destructive alternatives. Both tasklist_id and task_id are required parameters. The Google Tasks API does not support deleting tasks by task_id alone — you must specify which task list contains the task. Use 'List Task Lists' to get available list IDs, then 'List Tasks' to find the task_id within that list.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
