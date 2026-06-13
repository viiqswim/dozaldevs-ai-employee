# MAILCHIMP_DELETE_BATCH_WEBHOOK

**Description**: Permanently delete a batch webhook by its ID. Once deleted, the webhook URL will no longer receive POST notifications when batch operations complete. Use this action to remove webhooks that are no longer needed or to clean up invalid webhook endpoints. This action is idempotent - deleting a non-existent webhook returns a 404 error. Related actions: - list_batch_webhooks: Get all configured batch webhooks to find the ID - add_batch_webhook: Create a new batch webhook - update_batch_webhook: Modify an existing batch webhook's settings

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
