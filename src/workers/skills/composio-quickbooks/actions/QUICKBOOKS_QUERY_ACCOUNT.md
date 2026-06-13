# QUICKBOOKS_QUERY_ACCOUNT

**Description**: Query Account entities in QuickBooks using SQL-like syntax. IMPORTANT: Queries the Account entity ONLY (chart of accounts). For other entities (Purchase, Invoice, Bill, Payment, etc.), use their respective query actions. NOTE: API returns ALL fields with values regardless of SELECT clause (projections not supported). CRITICAL RESTRICTIONS: Parentheses and OR operator are NOT supported. Use IN operator for multiple values: WHERE AccountType IN ('Bank', 'Credit Card') Supports: WHERE clauses (=, <, >, LIKE, IN), AND operator, pattern matching (%), ORDER BY, pagination (MAXRESULTS up to 1000, STARTPOSITION), COUNT. Common fields: Id, Name, AccountType, AccountSubType, Classification, Active, FullyQualifiedName, CurrentBalance, AcctNum, Description, SubAccount. Examples: - SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 100 - SELECT * FROM Account WHERE Active = true ORDER BY Name - SELECT * FROM Account WHERE AccountType IN ('Bank', 'Credit Card')

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
