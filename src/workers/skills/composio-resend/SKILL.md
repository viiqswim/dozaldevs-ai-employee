---
name: composio-resend
description: 'Use when working with Resend via the Composio integration — reading, writing, or managing Resend content. Requires Resend to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Resend

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| RESEND_ADD_CONTACT_TO_SEGMENT | Add an existing contact to a segment in Resend. Use when you need to organize contacts into specific segments for targeted communication. |
| RESEND_CANCEL_EMAIL | Cancel a scheduled email. |
| RESEND_CREATE_API_KEY | Create a new API key to authenticate communications with Resend. Use when you need to generate a new authentication token for API access. |
| RESEND_CREATE_AUDIENCE | Create a list of contacts. |
| RESEND_CREATE_CONTACT | Create a contact in Resend. |
| RESEND_CREATE_CONTACT_PROPERTY | Tool to create a new contact property in Resend. Use when you need to define custom fields for contacts. |
| RESEND_CREATE_CONTACT_V2 | Tool to create a new contact in Resend. Use when you need to add a contact to Resend without specifying an audience. |
| RESEND_CREATE_DOMAIN | Create a domain through the Resend Email API. The domain is created in a pending/unverified state and cannot be used for sending emails until DNS verification is completed. |
| RESEND_CREATE_TEMPLATE | Tool to create a new email template in Resend. Use when you need to define reusable email templates with optional variables. |
| RESEND_CREATE_TOPIC | Tool to create a new topic to segment your audience. Use when you need to create a topic for organizing contacts by interests or preferences. |
| RESEND_CREATE_WEBHOOK | Tool to create a webhook to receive real-time notifications about email events. Use when you need to set up automated notifications for email status changes. |
| RESEND_DELETE_API_KEY | Remove an existing API key from Resend. Use when you need to revoke or delete an API key. |
| RESEND_DELETE_AUDIENCE | Remove an existing audience. |
| RESEND_DELETE_CONTACT | Delete a contact in Resend. |
| RESEND_DELETE_CONTACT_BY_ID | Tool to remove an existing contact by its ID. Use when you need to delete a contact directly without specifying an audience. |
| RESEND_DELETE_CONTACT_PROPERTY | Remove an existing contact property from Resend. |
| RESEND_DELETE_DOMAIN | Delete a domain through the Resend Email API. Deletion is irreversible; ensure no active email traffic or DNS configurations depend on the domain before calling. |
| RESEND_DELETE_SEGMENT | Remove an existing segment. Use when you need to permanently delete a segment by its ID. |
| RESEND_DELETE_TEMPLATE | Remove an existing template. Use this action when you need to delete a template from Resend. |
| RESEND_DELETE_TOPIC | Tool to remove an existing topic in Resend. Use when you need to delete a topic. |
| RESEND_DELETE_WEBHOOK | Remove an existing webhook. Use this to delete a webhook configuration when you no longer need to receive event notifications at that endpoint. |
| RESEND_DUPLICATE_TEMPLATE | Duplicate an existing template through the Resend Email API. Use when you need to create a copy of an existing template. |
| RESEND_GET_CONTACT | Tool to retrieve a single contact from Resend by ID or email. Use when you need to get details of a specific contact using the global contacts endpoint. |
| RESEND_GET_CONTACT_PROPERTY | Tool to retrieve a single contact property from Resend. Use when you need to get details about a specific contact property by its ID. |
| RESEND_GET_EMAIL_ATTACHMENT | Retrieve a single attachment from a sent email. Use when you need to access attachment metadata and download URL. |
| RESEND_GET_SEGMENT | Retrieve a single segment by its ID. Use when you need to get detailed information about a specific segment. |
| RESEND_GET_TEMPLATE | Retrieve a single template by ID or alias from Resend. Use when you need to view template details. |
| RESEND_GET_TOPIC | Tool to retrieve a single topic by its ID in Resend. Use when you need to fetch details of a specific topic. |
| RESEND_GET_WEBHOOK | Retrieve a single webhook for the authenticated user. Use this to get details about a specific webhook configuration including its endpoint, subscribed events, and signing secret. |
| RESEND_LIST_ALL_CONTACTS | Tool to retrieve a list of all contacts from Resend. Use when you need to fetch contacts across all audiences with optional pagination. |
| RESEND_LIST_API_KEYS | Tool to retrieve a list of API keys for the authenticated user. Use when you need to view all API keys associated with the account, including pagination support for large result sets. |
| RESEND_LIST_AUDIENCES | List all audiences. |
| RESEND_LIST_BROADCASTS | Tool to retrieve a list of broadcasts. Use when you need to fetch all broadcasts or paginate through them. |
| RESEND_LIST_CONTACT_PROPERTIES | Tool to retrieve a list of contact properties from Resend. Use when you need to view available contact property definitions. |
| RESEND_LIST_CONTACTS | List contacts in Resend. |
| RESEND_LIST_CONTACT_SEGMENTS | Retrieve a list of segments that a contact is part of. Use when you need to determine which segments a specific contact belongs to. |
| RESEND_LIST_CONTACT_TOPICS | Retrieve a list of topic subscriptions for a contact in Resend. Use when you need to check which topics a specific contact is subscribed to. |
| RESEND_LIST_DOMAINS | List all domains. Use the returned domain IDs as inputs for tools like RESEND_VERIFY_DOMAIN that require a domain_id. |
| RESEND_LIST_EMAIL_ATTACHMENTS | Tool to retrieve a list of attachments from a sent email. Use when you need to get information about files attached to an email sent via Resend. |
| RESEND_LIST_EMAILS | Tool to retrieve a list of emails sent by your team. Use when you need to fetch outbound emails from your account. Supports pagination with limit, after, and before parameters. |
| RESEND_LIST_RECEIVED_EMAILS | Tool to retrieve a list of received emails for the authenticated user. Use when you need to fetch incoming emails from the receiving endpoint. |
| RESEND_LIST_SEGMENTS | Tool to retrieve a list of segments from Resend. Use when you need to view all available segments for audience management. |
| RESEND_LIST_TEMPLATES | Tool to retrieve a list of templates from Resend. Use when you need to get all available templates with optional pagination support. |
| RESEND_LIST_TOPICS | Tool to retrieve a list of topics for the authenticated user. Use when you need to fetch available topics with optional pagination support. |
| RESEND_LIST_WEBHOOKS | Retrieve a list of webhooks for the authenticated user. Use this to view all configured webhooks with their endpoints, event types, and status. |
| RESEND_PUBLISH_TEMPLATE | Publish a template through the Resend Email API. Use when you need to make a template publicly available. |
| RESEND_REMOVE_CONTACT_FROM_SEGMENT | Remove an existing contact from a segment. Use when you need to disassociate a contact from a specific segment. |
| RESEND_RETRIEVE_AUDIENCE | Retrieve a single audience. |
| RESEND_RETRIEVE_CONTACT | Retrieve a contact in Resend. |
| RESEND_RETRIEVE_DOMAIN | Retrieve a single domain. |
| RESEND_RETRIEVE_EMAIL | Retrieve a single email. |
| RESEND_SEND_BATCH_EMAILS | Trigger up to 100 batch emails at once. Use when you need to send multiple emails in a single API request. |
| RESEND_SEND_EMAIL | Send an email using Resend. Confirm recipients and content with the user before invoking — sends are irreversible. All recipients must be listed explicitly via `to`, `cc`, or `bcc`; audience-based sending is unsupported. Render HTML or plain text externally before passing via `html` or `text`. |
| RESEND_UPDATE_BROADCAST | Update an existing broadcast in Resend. Use when you need to modify broadcast details like name, subject, content, or recipients. |
| RESEND_UPDATE_CONTACT | Tool to update an existing contact in Resend by ID or email. Use when you need to modify contact details such as name or subscription status. |
| RESEND_UPDATE_CONTACT_PROPERTY | Update an existing contact property in Resend. Only the fallback_value can be updated; the key and type fields cannot be changed after creation. |
| RESEND_UPDATE_DOMAIN | Update an existing domain. |
| RESEND_UPDATE_EMAIL | Update a scheduled email. |
| RESEND_UPDATE_TEMPLATE | Tool to update an existing email template in Resend. Use when you need to modify template properties such as name, subject, HTML content, or variables. |
| RESEND_UPDATE_TOPIC | Tool to update an existing topic in Resend. Use when you need to modify the name of a topic. |
| RESEND_UPDATE_WEBHOOK | Tool to update an existing webhook configuration. Use when you need to modify the endpoint URL, change event subscriptions, or enable/disable a webhook. |
| RESEND_VERIFY_DOMAIN | Verify a domain through the Resend Email API. DNS records must fully propagate before verification succeeds; avoid immediate retries after DNS setup. |
