# MAILCHIMP_ADD_OR_UPDATE_LIST_MEMBER

**Description**: Add or update a list member (subscriber) in a Mailchimp audience/list. This is an upsert operation: if the subscriber exists, they will be updated; if not, they will be created. The subscriber_hash parameter should be the MD5 hash of the lowercase email address. Note: If the list has required merge fields, use skip_merge_validation=true to bypass validation, or provide the required merge_fields values.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
