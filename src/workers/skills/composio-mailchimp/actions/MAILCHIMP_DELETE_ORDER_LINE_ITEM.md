# MAILCHIMP_DELETE_ORDER_LINE_ITEM

**Description**: Delete a specific line item from an order in a Mailchimp e-commerce store. This action permanently removes the specified line item from the order. The operation is idempotent - deleting an already-deleted line item returns the same success response. Prerequisites: The store, order, and line item must exist. Use MAILCHIMP_LIST_STORES, MAILCHIMP_LIST_ORDERS, and MAILCHIMP_LIST_ORDER_LINE_ITEMS to find valid IDs. Note: This action cannot be undone. To add the line item back, use MAILCHIMP_ADD_ORDER_LINE_ITEM.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
