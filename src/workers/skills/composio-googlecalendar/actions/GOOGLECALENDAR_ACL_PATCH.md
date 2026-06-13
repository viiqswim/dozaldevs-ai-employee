# GOOGLECALENDAR_ACL_PATCH

**Description**: Updates an existing access control rule for a calendar using patch semantics (partial update). This allows modifying specific fields without affecting other properties. IMPORTANT: The ACL rule must already exist on the calendar. This action cannot create new rules. If you receive a 404 Not Found error, the rule does not exist - use ACL insert to create it first, or use ACL list to verify available rules. Each patch request consumes three quota units. For domain-type ACL rules, if PATCH fails with 500 error, this action will automatically fallback to UPDATE method.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
