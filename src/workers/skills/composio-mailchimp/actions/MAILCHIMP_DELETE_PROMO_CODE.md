# MAILCHIMP_DELETE_PROMO_CODE

**Description**: Delete a promo code from an e-commerce store. This action permanently removes a specific promo code from a promo rule in a Mailchimp store. The promo code will no longer be available for customers to use. This action is idempotent - deleting an already-deleted promo code will not cause an error. Prerequisites: - The store must exist (use MAILCHIMP_LIST_STORES to verify) - The promo rule must exist in the store (use MAILCHIMP_LIST_PROMO_RULES to verify) - The promo code must exist within the promo rule (use MAILCHIMP_LIST_PROMO_CODES to verify) Note: This action is destructive and cannot be undone. The promo code will need to be recreated using MAILCHIMP_ADD_PROMO_CODE if you want to restore it.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
