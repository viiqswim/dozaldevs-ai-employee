# GMAIL_SEARCH_PEOPLE

**Description**: Searches contacts by matching the query against names, nicknames, emails, phone numbers, and organizations, optionally including 'Other Contacts'. Only searches the authenticated user's contact directory — people existing solely in message headers won't appear; use GMAIL_FETCH_EMAILS for those. Results may be zero or multiple; never auto-select from ambiguous results. Results paginate via next_page_token; follow until empty and deduplicate by email. Many records lack emailAddresses or names even when requested — handle missing keys. Directory/organization policies may suppress entries.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
