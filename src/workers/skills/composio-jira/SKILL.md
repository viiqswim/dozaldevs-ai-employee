---
name: composio-jira
description: 'Use when working with Jira via the Composio integration — reading, writing, or managing Jira content. Requires Jira to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Jira

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| JIRA_ADD_ATTACHMENT | Uploads and attaches a file to a Jira issue. |
| JIRA_ADD_COMMENT | Adds a comment using Atlassian Document Format (ADF) for rich text to an existing Jira issue. |
| JIRA_ADD_USERS_TO_PROJECT_ROLE | Adds users and optionally groups to a project role. |
| JIRA_ADD_USER_TO_GROUP | Adds a user to a Jira group. |
| JIRA_ADD_WATCHER_TO_ISSUE | Adds a user to an issue's watcher list by account ID. Requires the authenticated user to have permission to view the issue and manage watchers; insufficient permissions may result in silent failure or an error response. |
| JIRA_ADD_WORKLOG | Tool to add a worklog entry to a Jira issue. Use when logging time spent on an issue. |
| JIRA_ANALYSE_EXPRESSION | Analyses Jira expressions for syntax validation, type checking, and complexity analysis. Use when you need to validate Jira expression syntax before using it in automation rules, custom fields, or workflows. |
| JIRA_ASSIGN_ISSUE | Assigns a Jira issue to a user, default assignee, or unassigns; supports email/name lookup. |
| JIRA_BULK_CREATE_ISSUE | Creates multiple Jira issues (up to 50 per call) with full feature support including markdown, assignee resolution, and priority handling. |
| JIRA_CHECK_PERMISSIONS | Check user permissions for global and project-level operations in Jira. Use this action to verify whether a user has specific permissions at the system level or within projects. Useful for authorization checks before performing operations, or for auditing user access rights. |
| JIRA_CREATE_GROUP | Creates a new group in Jira with the specified name. |
| JIRA_CREATE_ISSUE | Creates a new Jira issue (e.g., bug, task, story) in a specified project. IMPORTANT: Different Jira projects may have custom required fields beyond the standard ones (summary, project_key, issue_type). If issue creation fails with 'field X is required', use JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS (requires projectIdOrKey and issueTypeId parameters) to discover available fields for your project, or check your Jira project's configuration. Custom fields can be provided via the 'additional_properties' parameter as a JSON string (e.g., '{"customfield_12345": "value"}'). Rapid bulk creation may trigger HTTP 429 rate limiting; throttle calls and use exponential backoff on 429 responses. |
| JIRA_CREATE_ISSUE_LINK | Links two Jira issues using a specified link type with optional comment. |
| JIRA_CREATE_JQL_AUTOCOMPLETEDATA | Retrieves JQL autocomplete reference data including reserved words, field names, and function names. Use when building JQL query editors or validating JQL syntax. |
| JIRA_CREATE_PROJECT | Creates a new Jira project with required lead, template, and type configuration. |
| JIRA_CREATE_SPRINT | Creates a new sprint on a Jira board with optional start/end dates and goal. |
| JIRA_CREATE_VERSION | Creates a new version for releases or milestones in a Jira project. |
| JIRA_DELETE_COMMENT | Deletes a specific comment from a Jira issue using its ID and the issue's ID/key; requires user permission to delete comments on the issue. |
| JIRA_DELETE_ISSUE | Permanently and irreversibly deletes a Jira issue by its ID or key. Obtain explicit user confirmation before calling. |
| JIRA_DELETE_VERSION | Deletes a Jira version and optionally reassigns its issues. |
| JIRA_DELETE_WORKLOG | Deletes a worklog from a Jira issue with estimate adjustment options. |
| JIRA_EDIT_ISSUE | Updates an existing Jira issue with field values and operations. Supports direct field parameters (summary, description, assignee, priority, etc.) that are merged with the fields parameter. Direct parameters take precedence. |
| JIRA_EVALUATE_JIRA_EXPRESSION | Tool to evaluate Jira expressions using the enhanced search API. Use when you need to extract or transform data from Jira using Jira expression language. Useful for complex data queries, transformations, and building custom objects from Jira data. |
| JIRA_FETCH_BULK_ISSUES | Tool to bulk fetch multiple Jira issues by their IDs or keys (max 100 per call). Use when you need to retrieve details for multiple issues efficiently in a single API call. |
| JIRA_FIND_USERS | DEPRECATED: Use JIRA_FIND_USERS2 instead. Searches for Jira users by email or display name to find account IDs; essential for assigning issues, adding watchers, and other user-related operations. Broad queries may return multiple matches — always disambiguate using full email before selecting an account_id. Results may include app/bot accounts; verify account_type is a human user before use in downstream operations. |
| JIRA_FIND_USERS2 | Tool to find users in Jira by query string, account ID, or property search. Use when you need to search for users to assign to issues, add as watchers, or perform other user-related operations. |
| JIRA_FIND_USERS_FOR_PICKER | Find users for picker components by matching query against user attributes like display name and email. |
| JIRA_GET_ALL_GROUPS | Retrieves all groups from the Jira instance with pagination support. Useful for resolving correct group names or IDs before passing them to other tools. Some returned groups are system-managed and may be inaccessible via other group operations. On large instances, omitting both pagination parameters to fetch all groups can be expensive; prefer targeted lookups with max_results and start_at when possible. |
| JIRA_GET_ALL_ISSUE_TYPE_SCHEMES | Retrieves all Jira issue type schemes with optional filtering and pagination. |
| JIRA_GET_ALL_PROJECTS | Retrieves all visible projects using the modern paginated Jira API with server-side filtering and pagination support. Results reflect only projects the authenticated user can access — small or empty result sets may indicate permission restrictions, not absence of projects. An empty `values` array means no projects matched the filters; relax `query`, `status`, or `categoryId` if unexpected. Project keys are mutable; prefer the stable numeric project ID for durable references in follow-up calls. |
| JIRA_GET_ALL_STATUSES | Retrieves all issue statuses associated with workflows from Jira. Returns global statuses that may not be valid for every project or workflow scheme; verify a returned status is applicable to the specific project before use. |
| JIRA_GET_ALL_USERS | Retrieves all users from the Jira instance including active, inactive, app accounts, and system accounts, with pagination support. On Jira Cloud, fields like `email_address` may be redacted due to privacy settings — never treat them as guaranteed present. Successful responses may silently omit users due to permission restrictions; a smaller-than-expected result set may reflect access limits, not absence of users. |
| JIRA_GET_ATTACHMENT | Retrieves the binary content of a Jira attachment by ID. Use when you need to download a specific file attached to an issue. |
| JIRA_GET_ATTACHMENT_META | Tool to retrieve Jira attachment settings including upload limits and enabled status. Use when you need to check if attachments are enabled or determine the maximum file size allowed. |
| JIRA_GET_COMMENT | Retrieves a specific comment by ID from a Jira issue with optional expansions. |
| JIRA_GET_COMPONENTS | Tool to retrieve components from Jira projects with search and filtering. Use when you need to list or find components across projects, optionally filtered by project IDs/keys or search query. |
| JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS | Tool to retrieve field metadata for a specific issue type in a project. Use this to discover required fields, allowed values, and field configurations before creating issues of a specific type. |
| JIRA_GET_CURRENT_USER | Retrieves detailed information about the currently authenticated Jira user. The returned `accountId` is the correct identifier for fields like `lead_account_id` in JIRA_CREATE_PROJECT, JIRA_ADD_WATCHER_TO_ISSUE, and JIRA_REMOVE_WATCHER_FROM_ISSUE — never use email or username in those fields. |
| JIRA_GET_DASHBOARDS | Tool to list and search Jira dashboards visible to the current user. Use when you need to discover available dashboards, filter by ownership or favorites, or retrieve dashboard details including permissions and popularity. |
| JIRA_GET_FAVORITE_FILTERS | Tool to retrieve favorite filters for the current user. Use when you need to discover which saved filters the user has marked as favorites. |
| JIRA_GET_FIELDS | Tool to retrieve Jira issue fields metadata. Use before editing an issue to discover custom field IDs and names. Custom fields are addressed as customfield_XXXXX in API calls and cf[XXXXX] in JQL; using display names instead causes 400 Unknown field errors. Returns global metadata — cross-reference with JIRA_GET_ISSUE_EDIT_META before editing, as globally visible fields not listed there will also cause 400 errors when sent to JIRA_EDIT_ISSUE. Results are scoped to the authenticated user's permissions, so field sets may differ between users. |
| JIRA_GET_FIELDS_PAGINATED | Tool to retrieve Jira fields in pages. Use when you need to filter or page through custom and system fields. |
| JIRA_GET_FILTER | Retrieves a specific Jira saved filter by ID, including its JQL and sharing metadata, to reuse in subsequent searches. Use when you need to fetch filter details or extract the JQL query to run searches. |
| JIRA_GET_GROUP | Retrieves details of a specific Jira group by name or ID. Use JIRA_GET_ALL_GROUPS to discover valid group names/IDs first. Some system-managed groups may be inaccessible due to permission restrictions even when name/ID is known. |
| JIRA_GET_INFO | Retrieves runtime information for the Jira Service Management instance. Use when you need to check the version, build date, or license status. |
| JIRA_GET_ISSUE | Retrieves a Jira issue by ID or key with customizable fields and expansions. Request only needed fields and expansions to avoid large responses. Use specific `customfield_*` keys in `fields` to verify updated values programmatically. |
| JIRA_GET_ISSUE_CREATE_METADATA | Tool to retrieve issue creation metadata for Jira projects. Use this to discover available projects, issue types, and required fields before creating issues. |
| JIRA_GET_ISSUE_EDIT_METADATA | Tool to retrieve editable fields for a Jira issue. Use before running an edit action to fetch custom field metadata and required fields. |
| JIRA_GET_ISSUE_LINK_TYPES | Retrieves all configured issue link types from Jira. |
| JIRA_GET_ISSUE_PICKER_SUGGESTIONS | Tool to get issue picker suggestions from Jira. Use when you need to search for issues and get auto-completion suggestions. |
| JIRA_GET_ISSUE_PROPERTY | Retrieves a custom property from a Jira issue by key. |
| JIRA_GET_ISSUE_RESOLUTIONS | Retrieves all available issue resolution types from Jira. |
| JIRA_GET_ISSUE_TYPES | Retrieves all Jira issue types available to the user using the modern API v3 endpoint; results vary based on 'Administer Jira' global or 'Browse projects' project permissions. Response includes two shapes: global issue types (no scope field) and project-scoped types (include scope.project.id); deduplicate by id, not name. Always use issuetype.id (not display name) when referencing issue types in other API calls to avoid validation errors. |
| JIRA_GET_ISSUE_WATCHERS | Retrieves users watching a Jira issue for update notifications. Watcher data access may be restricted by Jira permissions. Returns all watchers; filter client-side by `accountId` to check if a specific user is watching. |
| JIRA_GET_ISSUE_WORKLOGS | DEPRECATED: Use JIRA_GET_WORKLOG instead. This action is deprecated because it lacks the expand parameter for worklog properties. Use JIRA_GET_WORKLOG which provides the same functionality plus the ability to expand worklog properties using the 'expand' parameter. Legacy description: Retrieves worklogs for a Jira issue with user permission checks. |
| JIRA_GET_JQL_AUTOCOMPLETEDATA | Tool to retrieve JQL autocomplete reference data. Use when you need to discover available JQL fields, functions, and reserved words for building queries. |
| JIRA_GET_JQL_AUTOCOMPLETEDATA_SUGGESTIONS | Tool to get JQL field auto-complete suggestions. Use when building JQL queries to discover valid field values or predicate options. |
| JIRA_GET_MY_PERMISSIONS | Tool to retrieve the user's permissions in Jira. Use when checking what actions the authenticated user can perform in a specific context (project, issue, or comment). |
| JIRA_GET_MYPREFERENCES_LOCALE | Tool to retrieve the locale preference of the currently authenticated Jira user. Use when you need to know the user's language and regional settings. |
| JIRA_GET_PERMISSIONS | Tool to retrieve all available Jira permissions. Use when you need to list all permission types that exist in Jira, including project and global permissions. |
| JIRA_GET_PERMITTED_PROJECTS | Tool to retrieve projects where the current user has specific permissions. Use when you need to find which projects a user can access with certain permission levels. |
| JIRA_GET_PROJECT | Retrieves details of a Jira project by its ID or key. |
| JIRA_GET_PROJECT_ROLES | Retrieves all available roles for a Jira project. Role IDs are project-specific and must not be reused across projects; call this action per project to obtain correct role IDs. |
| JIRA_GET_PROJECT_TYPE | Retrieves detailed information about a specific Jira project type by its key. Use when you need to get metadata about project types like software, service desk, business, or product discovery projects. |
| JIRA_GET_PROJECT_VERSIONS | Retrieves all versions for a Jira project with optional expansion. Use version IDs from the response (not names) when setting fixVersions or affectedVersions on issues — submitting names alone causes 400 validation errors. |
| JIRA_GET_RECENT_PROJECTS | Retrieves a list of projects recently accessed by the authenticated user. |
| JIRA_GET_REMOTE_ISSUE_LINKS | Retrieves links from a Jira issue to external resources. |
| JIRA_GET_SERVER_INFO | Tool to retrieve Jira instance server information. Use when you need details about the Jira version, build, deployment type, or server configuration. |
| JIRA_GET_SERVICE_DESK_REQUEST_TYPE_FIELDS | Tool to retrieve JSM request type field metadata for filling out portal requests. Use when you need to know which fields are required and their valid values. |
| JIRA_GET_SYSTEM_AVATARS | Tool to retrieve all system avatars for a specific type (issuetype, project, user, or priority). Use when you need to get a list of available default avatars that can be assigned to Jira entities. |
| JIRA_GET_TRANSITIONS | Retrieves available workflow transitions for a Jira issue. Always use the numeric `id` from the response when calling JIRA_TRANSITION_ISSUE — transition IDs are project/workflow-specific and must not be hardcoded or reused across different issues or projects. When multiple transitions share similar names, use `id` to disambiguate. |
| JIRA_GET_UNIVERSAL_AVATAR_TYPE_OWNER | Tool to retrieve all avatars (system and custom) for a specific type and entity in Jira. Use when you need to view available avatar options for projects, issue types, or priorities. |
| JIRA_GET_UNIVERSAL_AVATAR_VIEW_TYPE | Tool to retrieve the default avatar image for a specific type (project, issuetype, or priority) from Jira. Use when you need to download the default avatar for a type. |
| JIRA_GET_VIEW_TYPE_AVATAR | Tool to retrieve a specific avatar image by type and ID from Jira. Use when you need to download avatar images for projects, issue types, or priorities. |
| JIRA_GET_VOTES | Fetches voting details for a Jira issue; requires voting to be enabled in Jira's general settings. |
| JIRA_GET_WORKLOG | Retrieves worklogs for a specified Jira issue. |
| JIRA_LIST_ALL_PROJECTS | Tool to list all projects accessible to the user. Use when you need to retrieve a comprehensive list of all Jira projects. |
| JIRA_LIST_BOARDS | Retrieves paginated Jira boards with filtering and sorting options. Use `start_at` and `max_results` together, looping through pages to retrieve all results. |
| JIRA_LIST_COMMENTS | Tool to retrieve multiple comments by their IDs in a single request. Use when you need to fetch specific comments efficiently. Supports up to 1000 comment IDs per request with optional expansion for rendered HTML and properties. |
| JIRA_LIST_FILTERS | Tool to search and list Jira saved filters (saved searches) visible to the current user. Use when you need to discover existing filters, find filters by name or owner, or get filter details including JQL queries and sharing permissions. |
| JIRA_LIST_GROUPS_PICKER | Tool to search and list groups using Jira's picker endpoint. Use when you need to find groups by name or get a filtered list of groups. |
| JIRA_LIST_ISSUE_COMMENTS | Retrieves paginated comments from a Jira issue with optional ordering. Paginate by incrementing `start_at` by `max_results` until the cumulative count reaches the `total` field in the response. A response with `total=0` and an empty comments array means the issue has no comments. |
| JIRA_LIST_PROJECT_TYPES | Retrieves all Jira project types available in the instance. Use when you need to discover available project types or list all types without filtering by a specific key. |
| JIRA_LIST_SPRINTS | Retrieves paginated sprints from a Jira board with optional state filtering. |
| JIRA_MOVE_ISSUE_TO_SPRINT | Moves one or more Jira issues to a specified active sprint. |
| JIRA_PARSE_JQL_QUERIES | Parse and validate JQL queries, returning their abstract syntax tree structure along with any errors or warnings. Use when you need to validate JQL syntax or understand query structure before execution. |
| JIRA_REMOVE_USER_FROM_GROUP | Removes a user from a Jira group. This is a destructive operation that revokes group-based permissions; confirm intent before calling. |
| JIRA_REMOVE_USER_FROM_PROJECT_ROLE | Removes a user or group from a project role. |
| JIRA_REMOVE_WATCHER_FROM_ISSUE | Removes a user from an issue's watcher list by account ID. |
| JIRA_SEARCH_APPROXIMATE_COUNT | Count issues matching a JQL query using approximate count endpoint. Use when you need a fast count of issues without retrieving full issue details. The JQL query must be bounded (include at least one search restriction). |
| JIRA_SEARCH_DASHBOARDS | Tool to search for Jira dashboards with filtering, sorting, and pagination support. Use when you need to find dashboards by name, owner, sharing permissions, or status. Supports filtering by owner account ID, group, project, and dashboard name. |
| JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET | Searches for Jira issues using JQL with pagination and field selection. |
| JIRA_SEARCH_FOR_ISSUES_USING_JQL_POST | DEPRECATED: Use JIRA_SEARCH_ISSUES instead. Searches for Jira Cloud issues using Enhanced JQL via POST request; supports eventual consistency and token-based pagination. Use this POST endpoint for long/complex JQL to avoid HTTP 414 errors on GET-based search. IMPORTANT: This action is for Jira Cloud only and will not work with Jira Server or Data Center instances. |
| JIRA_SEARCH_ISSUES | Advanced Jira issue search supporting structured filters and raw JQL. At least one filter parameter (e.g., jql, project_key, updated_after) is required; calls with no parameters will be rejected. |
| JIRA_SEND_NOTIFICATION_FOR_ISSUE | Sends a customized email notification for a Jira issue. |
| JIRA_TRANSITION_ISSUE | Transitions a Jira issue to a different workflow state, with support for transition name lookup and user assignment by email. IMPORTANT: Only fields that are on the transition's screen can be set during the transition. Which fields are available depends on the Jira workflow configuration and varies per project. Use JIRA_GET_TRANSITIONS with expand='transitions.fields' to check which fields a transition supports. If a field (e.g., assignee) is not on the transition screen, use a JIRA_EDIT_ISSUE action after the transition to set other fields. |
| JIRA_UPDATE_COMMENT | Updates text content or visibility of an existing Jira comment. |
