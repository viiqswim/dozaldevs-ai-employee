---
name: composio-googleads
description: 'Use when working with Googleads via the Composio integration — reading, writing, or managing Googleads content. Requires Googleads to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Googleads

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| GOOGLEADS_ADD_OR_REMOVE_TO_CUSTOMER_LIST | AddOrRemoveToCustomerList Tool will add a contact to a customer list in Google Ads. Note: It takes 6 to 12 hours for changes to be reflected in the customer list. Email addresses must comply with Google Ads policies and applicable privacy/consent laws. |
| GOOGLEADS_CREATE_CUSTOMER_LIST | Creates a customer list in Google Ads. Note: Requires an authenticated Google Ads connection with customer_id configured. Email-based lists must comply with Google Ads policies and applicable privacy/consent laws. Membership updates can take many hours to propagate; targeting eligibility is not immediate after creation. |
| GOOGLEADS_GET_CAMPAIGN_BY_ID | GetCampaignById Tool returns details of a campaign in Google Ads. Requires an active Google Ads OAuth connection with the correct customer_id configured; missing or mismatched customer_id will cause empty results. |
| GOOGLEADS_GET_CAMPAIGN_BY_NAME | Queries Google Ads via SQL to retrieve a campaign by its exact name. Requires an active Google Ads connection with valid customer_id and appropriate OAuth scopes. |
| GOOGLEADS_GET_CUSTOMER_LISTS | GetCustomerLists Tool lists all customer lists (audience/remarketing lists) in Google Ads. These are user segments for targeting, not Google Ads accounts — list IDs are distinct from account IDs. When multiple lists share similar names, review all returned results before selecting one for downstream operations. |
| GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS | ListAccessibleCustomers retrieves all Google Ads customer accounts accessible to the authenticated user. Returns resource names of customers (e.g., customers/1234567890) that can be accessed with the current OAuth credentials. Use this action to discover which customer IDs are available before making other API calls. Use this action when you need to determine which customer accounts the authenticated user has access to, or when you want to populate a dropdown of available accounts for the user to select from. |
| GOOGLEADS_MUTATE_AD_GROUPS | Create, update, or remove ad groups within Google Ads campaigns. Supports batch operations with multiple ad group changes in a single request. Use when you need to manage ad groups programmatically, such as creating new ad groups for campaigns, updating ad group settings or status, or removing ad groups that are no longer needed. This action is irreversible for remove operations — deleted ad groups cannot be recovered once removed. |
| GOOGLEADS_MUTATE_CAMPAIGNS | Create, update, or remove Google Ads campaigns in batch. Supports multiple operations (create, update, remove) in a single request. Use when managing campaign lifecycle, applying bulk changes, or automating campaign management workflows. This action is irreversible for remove operations — deleted campaigns cannot be recovered. Plan accordingly and consider using validate_only=true to test changes before applying them. |
| GOOGLEADS_SEARCH_STREAM_GAQL | Execute a Google Ads Query Language (GAQL) query and stream all results in a single response. This method is more efficient than paginated search for bulk data retrieval of campaigns, ad groups, and performance metrics (clicks, impressions, cost). Use this action when you need the entire result set without pagination. Results are returned as a single response containing all matching rows. |
