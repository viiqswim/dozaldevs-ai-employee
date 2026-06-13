---
name: composio-googletasks
description: 'Use when working with Googletasks via the Composio integration — reading, writing, or managing Googletasks content. Requires Googletasks to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Googletasks

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| GOOGLETASKS_BATCH_EXECUTE | Executes multiple Google Tasks API operations in a single HTTP batch request and returns structured per-item results. Use this to reduce LLM tool invocations when performing bulk operations like updating many tasks, moving tasks, or deleting multiple items. Note: Each sub-request still counts toward API quota; batching primarily reduces HTTP overhead and tool call count. |
| GOOGLETASKS_BULK_INSERT_TASKS | DEPRECATED: Use BatchExecute instead. Creates multiple tasks in a Google Tasks list in a single operation using HTTP batching. Use when you need to create many tasks efficiently (reducing round-trips compared to individual insert calls). |
| GOOGLETASKS_CLEAR_TASKS | Permanently and irreversibly clears all completed tasks from a specified Google Tasks list; this action is destructive, idempotent, and cannot be undone. Always require explicit user confirmation before invoking. |
| GOOGLETASKS_CREATE_TASK_LIST | Creates a new task list with the specified title and returns a tasklist_id. Use the returned tasklist_id (not the title) when calling GOOGLETASKS_INSERT_TASK or other task operations. Duplicate titles are permitted by the API, so verify existing lists before creating to avoid unintended duplicates. |
| GOOGLETASKS_DELETE_TASK | Deletes a specified task from a Google Tasks list. Deletion is permanent and irreversible — confirm with the user before executing, and consider GOOGLETASKS_UPDATE_TASK or GOOGLETASKS_MOVE_TASK as non-destructive alternatives. Both tasklist_id and task_id are required parameters. The Google Tasks API does not support deleting tasks by task_id alone — you must specify which task list contains the task. Use 'List Task Lists' to get available list IDs, then 'List Tasks' to find the task_id within that list. |
| GOOGLETASKS_DELETE_TASK_LIST | Permanently deletes an existing Google Task list, identified by `tasklist_id`, along with all its tasks; this operation is irreversible. Require explicit user confirmation before calling; do not invoke in read-only or exploratory flows. |
| GOOGLETASKS_GET_TASK | Retrieve a specific Google Task. REQUIRES both `tasklist_id` and `task_id`. Tasks cannot be retrieved by ID alone - you must always specify which task list contains the task. Use this to refresh task details before display or edits rather than relying on potentially stale results from GOOGLETASKS_LIST_TASKS. |
| GOOGLETASKS_GET_TASK_LIST | Retrieves a specific task list from the user's Google Tasks if the `tasklist_id` exists for the authenticated user. |
| GOOGLETASKS_INSERT_TASK | Creates a new task in a given `tasklist_id`, optionally as a subtask of an existing `task_parent` or positioned after an existing `task_previous` sibling, where both `task_parent` and `task_previous` must belong to the same `tasklist_id` if specified. IMPORTANT: Date fields (due, completed) accept various formats like '28 Sep 2025', '11:59 PM, 22 Sep 2025', or ISO format '2025-09-21T15:30:00Z' and will automatically convert them to RFC3339 format required by the API. Not idempotent — repeated calls with identical parameters create duplicate tasks; track returned task IDs to avoid duplication. High-volume inserts may trigger 403 rateLimitExceeded or 429; apply exponential backoff. |
| GOOGLETASKS_LIST_ALL_TASKS | Tool to list all tasks across all of the user's task lists with optional filters. Use when the agent needs to see all tasks without knowing which list to query first. Each returned task is annotated with its tasklist_id and tasklist_title for context. |
| GOOGLETASKS_LIST_TASK_LISTS | Fetches the authenticated user's task lists from Google Tasks; results may be paginated. Response contains task lists under the `items` key. Multiple lists may share similar names — confirm the correct list by ID before passing to other tools. |
| GOOGLETASKS_LIST_TASKS | Retrieves tasks from a Google Tasks list; all date/time strings must be RFC3339 UTC, and `showCompleted` must be true if `completedMin` or `completedMax` are specified. Response key for tasks is `tasks` (not `items`). No full-text search; filter client-side by title/notes. Results ordered by position, not by date. |
| GOOGLETASKS_MOVE_TASK | Moves the specified task to another position in the task list or to a different task list. Use cases: - Reorder tasks within a list (use 'previous' parameter) - Create subtasks by moving a task under a parent (use 'parent' parameter) - Move tasks between different task lists (use 'destinationTasklist' parameter) - Move a subtask back to top-level (omit 'parent' parameter) |
| GOOGLETASKS_PATCH_TASK | Partially updates an existing task (identified by `task_id`) within a specific Google Task list (identified by `tasklist_id`), modifying only the provided attributes from `TaskInput` (e.g., `title`, `notes`, `due` date, `status`) and requiring both the task and list to exist. |
| GOOGLETASKS_PATCH_TASK_LIST | Updates the title of an existing Google Tasks task list. |
| GOOGLETASKS_UPDATE_TASK | DEPRECATED: Use GOOGLETASKS_PATCH_TASK instead. Full-update (PUT-style) operation that overwrites unspecified fields with empty/default values, which can cause data loss. Prefer GOOGLETASKS_PATCH_TASK unless a complete field replacement is explicitly required. |
| GOOGLETASKS_UPDATE_TASK_FULL | Tool to fully replace an existing Google Task using PUT method. Use when you need to update the entire task resource, not just specific fields. This method requires all required fields (id, title) and replaces the complete task, unlike PATCH which supports partial updates. |
| GOOGLETASKS_UPDATE_TASK_LIST | Updates the authenticated user's specified task list. |
