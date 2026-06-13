# MAILCHIMP_CUSTOMER_JOURNEYS_API_TRIGGER_FOR_A_CONTACT

**Description**: Trigger a Customer Journey step for a specific contact via the Mailchimp API. This endpoint allows you to programmatically activate an API trigger step in a Customer Journey for a given contact. Before using this action: 1. Create a Customer Journey in the Mailchimp app with an "API Trigger" as a starting point or step 2. Mailchimp will provide you with a URL containing the journey_id and step_id 3. Use those IDs along with the contact's email address to trigger the journey The contact must be a member of the audience associated with the Customer Journey. Returns HTTP 204 (No Content) on success with an empty response body.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
