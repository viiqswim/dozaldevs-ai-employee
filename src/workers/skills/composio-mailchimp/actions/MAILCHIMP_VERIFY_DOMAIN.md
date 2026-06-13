# MAILCHIMP_VERIFY_DOMAIN

**Description**: Complete domain verification by submitting the verification code. This action completes the domain verification process started by 'add_domain_to_account'. When a domain is added, a verification email is sent to the specified email address containing a unique verification code. Use this action to submit that code and complete the verification. Once verified, the domain can be used as a sender address in campaigns. Prerequisites: - Domain must be added first using 'add_domain_to_account' - Domain status should be 'VERIFICATION_IN_PROGRESS' - You need the verification code from the email sent during domain addition Common errors: - 400: Invalid verification code - the code doesn't match or has expired - 404: Domain not found - the domain hasn't been added to the account

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
