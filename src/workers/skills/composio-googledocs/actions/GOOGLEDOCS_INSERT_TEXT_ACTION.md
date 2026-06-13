# GOOGLEDOCS_INSERT_TEXT_ACTION

**Description**: Tool to insert a string of text at a specified location within a Google Document. Use when you need to add new text content to an existing document. IMPORTANT: Two ways to specify insertion location: 1. Use 'insertion_index' to insert at a specific position (index 1 is safe for document start) 2. Use 'append_to_end=true' to append text to the end of the document (recommended for appending) CRITICAL CONSTRAINT: When using insertion_index, the index MUST fall within the bounds of an EXISTING paragraph. You cannot insert text at arbitrary indices or at structural boundaries (e.g., table starts). The index must also be strictly less than the document's end index. To safely append text without index concerns, use append_to_end=true.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
