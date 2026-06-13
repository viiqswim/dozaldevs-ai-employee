# MAILCHIMP_BATCH_ADD_OR_REMOVE_MEMBERS

**Description**: Batch add or remove list members from a static segment in Mailchimp. This action allows you to efficiently manage membership in a static segment by adding and/or removing multiple email addresses in a single API call. Only works with static segments (not saved/dynamic segments based on conditions). Important notes: - At least one of members_to_add or members_to_remove must be provided - Email addresses must already exist as subscribers in the list - Non-existent emails are silently ignored (no error raised) - Maximum 500 emails can be processed per request for each operation - The segment must be a static segment (type='static'), not a saved segment

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
