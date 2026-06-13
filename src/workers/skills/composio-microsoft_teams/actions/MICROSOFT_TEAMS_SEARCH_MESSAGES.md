# MICROSOFT_TEAMS_SEARCH_MESSAGES

**Description**: Search Microsoft Teams messages using powerful KQL syntax. Supports sender (from:), date filters (sent:), attachments, and boolean logic. Works across all Teams chats and channels the user has access to. Examples: 'from:user@example.com AND sent>=2024-10-01', 'punchlist OR termination', 'sent>today-30 AND hasattachment:yes' NOTE: This action requires an organizational Microsoft 365 account (Azure AD/Entra ID). It does NOT work with personal Microsoft accounts (MSA) such as @outlook.com, @hotmail.com, or @live.com. If using a personal Microsoft account, this search will fail.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
