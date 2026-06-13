---
name: composio-apollo
description: 'Use when working with Apollo via the Composio integration — reading, writing, or managing Apollo content. Requires Apollo to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Apollo

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| APOLLO_ADD_CONTACTS_TO_SEQUENCE | Adds contacts to a specified Apollo email sequence and returns the contact details. `sequence_id`, `emailer_campaign_id`, and `send_email_from_email_account_id` must be retrieved from Apollo listing/search endpoints before calling this tool — these IDs cannot be inferred from names. |
| APOLLO_BULK_ORGANIZATION_ENRICHMENT | Enriches data for up to 10 organizations simultaneously by providing a list of their base company domains (e.g., 'apollo.io', not 'www.apollo.io'). Each call consumes Apollo credits per domain enriched; monitor quota to avoid exhaustion errors. |
| APOLLO_BULK_PEOPLE_ENRICHMENT | Use to enrich multiple person profiles simultaneously with comprehensive data from Apollo's database. Each call consumes Apollo credits; avoid re-enriching the same contacts. Responses may include null or missing fields (e.g., email, phone, organization); treat unmatched records as valid 'no match' outcomes, not errors. Heavy use may trigger HTTP 429; respect Retry-After headers. |
| APOLLO_BULK_UPDATE_ACCOUNT_STAGE | Bulk updates the stage for specified existing Apollo.io accounts, moving them to a valid new account stage. |
| APOLLO_CREATE_ACCOUNT | Creates a new account in Apollo.io; a new record is created even if a similar account exists, and provided `owner_id` or `account_stage_id` must be valid existing IDs. The response includes the new account's ID, which can be used directly in subsequent calls. |
| APOLLO_CREATE_BULK_ACCOUNTS | Creates multiple accounts in Apollo.io with a single API call (maximum 100 accounts per request). Use when creating multiple company records at once. |
| APOLLO_CREATE_BULK_CONTACTS | Tool to bulk create multiple contacts in Apollo with a single API call. Use when you need to create multiple contacts efficiently. Supports up to 100 contacts per request with optional deduplication. |
| APOLLO_CREATE_CALL_RECORD | Tool to log call records in Apollo from external systems. Use when recording calls made through outside systems like Orum or Nooks; requires a master API key and cannot dial prospects directly. |
| APOLLO_CREATE_CONTACT | Creates a new contact in Apollo.io; use `account_id` to link to an organization and `contact_stage_id` for sales stage. Apollo does not auto-deduplicate — duplicate records sharing the same email are silently created; always search via APOLLO_SEARCH_CONTACTS before calling this tool. Requires explicit user confirmation before execution. |
| APOLLO_CREATE_CUSTOM_FIELD | Creates a new custom field in Apollo.io for contacts, accounts, or opportunities. Use when you need to define additional data fields beyond Apollo's standard attributes. |
| APOLLO_CREATE_DEAL | Creates a new sales opportunity (deal) in Apollo.io; all provided IDs (`owner_id`, `account_id`, `opportunity_stage_id`) must be valid existing Apollo identifiers. This action has persistent side effects — obtain explicit user confirmation before invoking. |
| APOLLO_CREATE_TASK | Tool to create a single task in Apollo.io. Use when you need to add a new task to your team's Apollo account for a specific contact. The task will be assigned to a user and includes details like type, status, priority, due date, and optional notes. |
| APOLLO_GET_ACCOUNT | Tool to retrieve detailed information about a specific account by its Apollo ID. Use when you need to fetch complete account data including company details, contact information, and CRM integration fields. |
| APOLLO_GET_AUTH_STATUS | Tool to check whether the provided Apollo API key is valid and accepted by Apollo (health/auth check). Use when any Apollo endpoint returns 401/403/422 to quickly diagnose invalid/expired keys versus permission scope issues. If this succeeds but other endpoints return 403, it strongly suggests permissioning or master-key scope issues rather than a totally invalid credential. |
| APOLLO_GET_CONTACT | Retrieves detailed information about a specific contact by its ID. Use this to view contact details including name, email, phone numbers, organization, and custom fields. |
| APOLLO_GET_DEAL | Retrieves information about a specific deal by its ID. Use this when you need to view details of a single deal. |
| APOLLO_GET_LABELS | Retrieves all labels from Apollo.io, used for organizing contacts and accounts. Call this before APOLLO_CREATE_CONTACT or APOLLO_UPDATE_ACCOUNT to validate label values against the returned list; mismatched labels cause 400/422 errors. |
| APOLLO_GET_OPPORTUNITY_STAGES | Retrieves all configured opportunity (deal) stages from the Apollo.io account. |
| APOLLO_GET_ORGANIZATION | Retrieves complete information about a specific organization by its Apollo ID. Use when you need detailed company data including funding, technologies, employee counts, and more. |
| APOLLO_GET_ORGANIZATION_JOB_POSTINGS | Retrieves paginated job postings for a specified organization by its ID, optionally filtering by domain; ensure `organization_id` is a valid identifier. |
| APOLLO_GET_TYPED_CUSTOM_FIELDS | Retrieves all typed custom field definitions available in the Apollo.io instance, detailing their types and configurations. Call before constructing payloads for APOLLO_UPDATE_CONTACT or APOLLO_UPDATE_ACCOUNT — mismatched types or invalid enum options cause 400 errors. |
| APOLLO_LIST_ACCOUNT_STAGES | Retrieves the IDs for all available account stages in your team's Apollo account. |
| APOLLO_LIST_CONTACT_STAGES | Retrieves all available contact stages from an Apollo account, including their unique IDs and names. |
| APOLLO_LIST_DEALS | Retrieves a list of deals from Apollo, using Apollo's default sort order if 'sort_by_field' is omitted. |
| APOLLO_LIST_EMAIL_ACCOUNTS | Retrieves all email accounts and their details for the authenticated user; takes no parameters. |
| APOLLO_LIST_FIELDS | Retrieves all field definitions from Apollo.io, including system fields and custom fields. Use the optional 'source' parameter to filter by field type (system, custom, or crm_synced). |
| APOLLO_LIST_USERS | Retrieves a list of all users (teammates) associated with the Apollo account, supporting pagination via `page` and `per_page` parameters. Use this to obtain numeric user IDs required by operations like APOLLO_UPDATE_CONTACT_OWNERSHIP — names or email addresses are not accepted in place of these IDs. |
| APOLLO_ORGANIZATION_ENRICHMENT | Fetches comprehensive organization enrichment data from Apollo.io for a given company domain; results are most meaningful if the company exists in Apollo's database. Each call consumes Apollo credits and may be unavailable on free plans. Returns HTTP 429 under burst usage; use exponential backoff on retries. |
| APOLLO_ORGANIZATION_SEARCH | Searches Apollo's database for organizations using various filters; consumes credits on every call (unavailable on free plans) — avoid re-running identical queries and surface quota errors rather than retrying. Retrieves a maximum of 50,000 records; uses `page` (1-500) and `per_page` (1-100) for pagination — check `total_pages` in the response to iterate. Overly strict filter combinations can return zero results; start broad and narrow iteratively. Empty results and `org_not_found` are valid outcomes, not errors. |
| APOLLO_PEOPLE_ENRICHMENT | Enriches and retrieves information for a person from Apollo.io. Requires one of: `id`, `email`, `hashed_email`, `linkedin_url`, or (`first_name` and `last_name` with `organization_name` or `domain`) for matching. `webhook_url` must be provided if `reveal_phone_number` is true. Name-only inputs without `organization_name` or `domain` frequently return no matches. |
| APOLLO_PEOPLE_SEARCH | Searches Apollo's contact database for people using various filters; results capped at 50,000 records and does not enrich contact data. Combining multiple strict filters (organization_ids, person_titles, person_seniorities) can return zero results — start broad and narrow iteratively. Result records may have null email, phone, or organization fields. |
| APOLLO_SEARCH_ACCOUNTS | Searches for accounts within your existing Apollo.io database using various criteria; requires a paid plan and is limited to 50,000 records. |
| APOLLO_SEARCH_CALLS | Searches for call records in Apollo.io using filters like date range, duration, direction (inbound/outgoing), users, contacts, purposes, outcomes, and keywords. Supports pagination for efficient data retrieval. |
| APOLLO_SEARCH_CONTACTS | Searches Apollo contacts using keywords, stage IDs (from 'List Contact Stages' action), or sorting (max 50,000 records; `sort_ascending` requires `sort_by_field`). Search before creating contacts to avoid duplicates. |
| APOLLO_SEARCH_NEWS_ARTICLES | Tool to search for news articles about companies in Apollo's database. Use when you need to find recent news, announcements, or updates about specific organizations using their Apollo IDs. |
| APOLLO_SEARCH_OUTREACH_EMAILS | Tool to search for outreach emails sent through Apollo sequences. Use when you need to find emails created and sent by your team as part of Apollo email campaigns. This endpoint requires a master API key and has a display limit of 50,000 records (100 records per page, up to 500 pages). |
| APOLLO_SEARCH_SEQUENCES | Searches for sequences (e.g., automated email campaigns) in Apollo.io. |
| APOLLO_SEARCH_TASKS | Searches for tasks in Apollo.io using filters like keywords, date ranges (due, created, updated), priorities, types, assigned users, associated contacts/accounts, supporting sorting and pagination. |
| APOLLO_UPDATE_ACCOUNT | Updates specified attributes of an existing account in Apollo.io. |
| APOLLO_UPDATE_ACCOUNT_OWNERS | Updates the ownership of multiple Apollo accounts to a specified user. Use when bulk assigning account ownership to a team member. |
| APOLLO_UPDATE_CALL_RECORD | Tool to update an existing call record in Apollo.io. Use when you need to modify details of a previously logged phone call such as duration, status, notes, or associated contact/account information. |
| APOLLO_UPDATE_CONTACT | Tool to update an existing contact's information in Apollo. Use when you need to modify contact details such as name, email, phone, title, organization, or custom fields. At least one field beyond contact_id must be provided. |
| APOLLO_UPDATE_CONTACT_OWNERSHIP | Updates the ownership of specified Apollo contacts to a given Apollo user, who must be part of the same team. |
| APOLLO_UPDATE_CONTACTS_BULK | Tool to bulk update multiple Apollo contacts with a single API call. Use when updating multiple contacts simultaneously - either apply the same updates to all contacts using contact_ids, or apply different updates to each contact using contact_attributes. Automatically processes asynchronously for more than 100 contacts. |
| APOLLO_UPDATE_CONTACT_STAGE | Updates the stage for one or more existing contacts in Apollo.io to a new valid contact stage, useful for managing sales funnel progression. |
| APOLLO_UPDATE_CONTACT_STATUS_IN_SEQUENCE | Updates a contact's status within a designated Apollo sequence, but cannot set the status to 'active'. |
| APOLLO_UPDATE_DEALS | Updates specified fields of an existing Apollo.io deal (opportunity), requiring a valid `opportunity_id`. |
| APOLLO_VIEW_API_USAGE_STATS | Fetches Apollo API usage statistics and rate limits for the connected team. Use before large enrichment/search runs to understand current API usage and plan/budget constraints. If experiencing 403s on credit/usage sensitive endpoints, use this tool to confirm whether the key has master privileges (this endpoint will 403 without a master key). |
