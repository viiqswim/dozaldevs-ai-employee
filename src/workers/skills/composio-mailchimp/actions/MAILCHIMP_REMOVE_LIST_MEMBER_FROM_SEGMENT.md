# MAILCHIMP_REMOVE_LIST_MEMBER_FROM_SEGMENT

**Description**: Remove a member from a static segment in a Mailchimp list/audience. This action removes a list member from a specified static segment. The member remains in the list - they are only removed from the segment membership. Important notes: - Only works with static segments (type='static'), not dynamic/saved segments - Returns HTTP 204 No Content on success - Returns HTTP 404 if the member is not found in the segment - This is an idempotent operation

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
