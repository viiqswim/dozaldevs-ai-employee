# QUICKBOOKS_QUERY_ENTITIES

**Description**: Execute SQL-like queries on QuickBooks Online entities. Supports all entity types (Customer, Invoice, Bill, Payment, Purchase, Account, etc.) with WHERE clauses, pattern matching, ordering, and pagination. IMPORTANT: Many fields are NOT queryable in WHERE clauses including PrivateNote, AccountRef, CurrencyRef, DepartmentRef, ClassRef, etc. Use queryable fields like Id, TxnDate, PaymentType, DisplayName instead. For non-queryable field filtering, query by date range and filter client-side. See parameter description for full list of queryable vs non-queryable fields. Use entity-specific query tools when available for typed responses.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
