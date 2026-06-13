# QUICKBOOKS_CREATE_INVOICE

**Description**: Creates a new invoice in QuickBooks for a customer. An invoice represents a sales transaction where goods or services are sold to a customer on credit or for immediate payment. This action requires: - A valid customer ID (obtain from QUICKBOOKS_CREATE_CUSTOMER or QUICKBOOKS_READ_CUSTOMER) - At least one line item with a valid item/service ID and amount The created invoice will have a unique ID, document number, due date, total amount, and balance. Use this to bill customers for products or services rendered. To update the invoice later, re-read it first to obtain the current SyncToken; stale tokens cause update rejections.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
