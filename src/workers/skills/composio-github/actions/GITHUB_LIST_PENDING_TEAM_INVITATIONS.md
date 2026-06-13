# GITHUB_LIST_PENDING_TEAM_INVITATIONS

**Description**: Lists all pending membership invitations for a specified team within an organization. The authenticated user must be an organization member with the read:org scope. The response includes invitation details such as the invitee's login/email, the role they're being invited to, and who sent the invitation. The 'role' field indicates the type of invitation: - 'direct_member': Regular organization member - 'admin': Organization administrator - 'billing_manager': Billing manager role - 'hiring_manager': Hiring manager role - 'reinstate': Reinstating a previous member Note: If the invitee is not a GitHub member, the 'login' field will be null and only the 'email' field will be populated.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
