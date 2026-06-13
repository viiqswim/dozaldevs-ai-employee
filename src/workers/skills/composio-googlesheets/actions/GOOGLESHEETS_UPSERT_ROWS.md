# GOOGLESHEETS_UPSERT_ROWS

**Description**: Upsert rows - update existing rows by key, append new ones. Automatically handles column mapping and partial updates. Use for: CRM syncs (match Lead ID), transaction imports (match Transaction ID), inventory updates (match SKU), calendar syncs (match Event ID). Features: - Auto-adds missing columns to sheet - Partial column updates (only update Phone + Status, preserve other columns) - Column order doesn't matter (auto-maps by header name) - Prevents duplicates by matching key column Example inputs: - Contact update: keyColumn='Email', headers=['Email','Phone','Status'], data=[['john@ex.com','555-0101','Active']] - Inventory sync: keyColumn='SKU', headers=['SKU','Stock','Price'], data=[['WIDGET-001',50,9.99],['GADGET-002',30,19.99]] - CRM lead update: keyColumn='Lead ID', headers=['Lead ID','Score','Status'], data=[['L-12345',85,'Hot']] - Partial update: keyColumn='Email', headers=['Email','Phone'] (only updates Phone, preserves Name/Address/etc)

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
