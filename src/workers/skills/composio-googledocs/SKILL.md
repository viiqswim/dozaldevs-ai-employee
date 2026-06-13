---
name: composio-googledocs
description: 'Use when working with Googledocs via the Composio integration — reading, writing, or managing Googledocs content. Requires Googledocs to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Googledocs

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| GOOGLEDOCS_COPY_DOCUMENT | Tool to create a copy of an existing Google Document. Use this to duplicate a document, for example, when using an existing document as a template. The copied document will have a default title (e.g., 'Copy of [original title]') if no new title is provided, and will be placed in the user's root Google Drive folder. |
| GOOGLEDOCS_CREATE_DOCUMENT | Creates a new Google Docs document using the provided title as filename and inserts the initial text at the beginning if non-empty, returning the document's ID and metadata (excluding body content). |
| GOOGLEDOCS_CREATE_DOCUMENT2 | DEPRECATED: Use GOOGLEDOCS_CREATE_DOCUMENT instead. Tool to create a blank Google Docs document with a specified title. Use when you need to create a new, empty document. |
| GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN | Creates a new Google Docs document, optionally initializing it with a title and content provided as Markdown text. |
| GOOGLEDOCS_CREATE_FOOTER | Tool to create a new footer in a Google Document. Use when you need to add a footer, optionally specifying its type and the section it applies to. |
| GOOGLEDOCS_CREATE_FOOTNOTE | Tool to create a new footnote in a Google Document. Use this when you need to add a footnote at a specific location or at the end of the document body. |
| GOOGLEDOCS_CREATE_HEADER | Tool to create a new header in a Google Document, optionally with text content. Use this tool when you need to add a header to a document. You can provide: - document_id: The ID of the document (required) - type: The header type (DEFAULT is the standard header) - text: Optional text content to add to the header - section_break_location: Optional location for section-specific headers |
| GOOGLEDOCS_CREATE_NAMED_RANGE | Tool to create a new named range in a Google Document. Use this to assign a name to a specific part of the document for easier reference or programmatic manipulation. |
| GOOGLEDOCS_CREATE_PARAGRAPH_BULLETS | Tool to add bullets to paragraphs within a specified range in a Google Document. Use when you need to format a list or a set of paragraphs as bullet points. |
| GOOGLEDOCS_DELETE_CONTENT_RANGE | Tool to delete a range of content from a Google Document. Use when you need to remove a specific portion of text or other structural elements within a document. Note: Every segment (body, header, footer, footnote) in Google Docs ends with a final newline character that cannot be deleted. Ensure the endIndex does not include this trailing newline. |
| GOOGLEDOCS_DELETE_FOOTER | Tool to delete a footer from a Google Document. Use when you need to remove a footer from a specific section or the default footer. |
| GOOGLEDOCS_DELETE_HEADER | Deletes the header from the specified section or the default header if no section is specified. Use this tool to remove a header from a Google Document. |
| GOOGLEDOCS_DELETE_NAMED_RANGE | Tool to delete a named range from a Google Document. Use when you need to remove a previously defined named range by its ID or name. |
| GOOGLEDOCS_DELETE_PARAGRAPH_BULLETS | Tool to remove bullets from paragraphs within a specified range in a Google Document. Use when you need to clear bullet formatting from a section of a document. |
| GOOGLEDOCS_DELETE_TABLE_COLUMN | Tool to delete a column from a table in a Google Document. Use this tool when you need to remove a specific column from an existing table within a document. |
| GOOGLEDOCS_DELETE_TABLE_ROW | Tool to delete a row from a table in a Google Document. Use when you need to remove a specific row from an existing table. |
| GOOGLEDOCS_EXPORT_DOCUMENT_AS_PDF | Tool to export a Google Docs file as PDF using the Google Drive API. Use when you need to generate a PDF version of a Google Docs document for download or distribution. Note: Google Drive enforces a 10MB limit on export content. |
| GOOGLEDOCS_GET_DOCUMENT_BY_ID | Retrieves an existing Google Document by its ID; will error if the document is not found. |
| GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT | Retrieve a Google Doc by ID and return a best-effort plain-text rendering. Converts document structure into plain text including paragraphs, lists, and tables without requiring clients to traverse complex Docs API JSON. |
| GOOGLEDOCS_INSERT_INLINE_IMAGE | Tool to insert an image from a given URI at a specified location in a Google Document as an inline image. Use when you need to add an image to a document programmatically. |
| GOOGLEDOCS_INSERT_PAGE_BREAK | Tool to insert a page break into a Google Document. Use when you need to start new content on a fresh page, such as at the end of a chapter or section. |
| GOOGLEDOCS_INSERT_TABLE_ACTION | Tool to insert a table into a Google Document. Use when you need to add a new table at a specific location or at the end of a segment (like document body, header, or footer) in a document. |
| GOOGLEDOCS_INSERT_TABLE_COLUMN | Tool to insert a new column into a table in a Google Document. Use this tool when you need to add a column to an existing table at a specific location. |
| GOOGLEDOCS_INSERT_TEXT_ACTION | Tool to insert a string of text at a specified location within a Google Document. Use when you need to add new text content to an existing document. IMPORTANT: Two ways to specify insertion location: 1. Use 'insertion_index' to insert at a specific position (index 1 is safe for document start) 2. Use 'append_to_end=true' to append text to the end of the document (recommended for appending) CRITICAL CONSTRAINT: When using insertion_index, the index MUST fall within the bounds of an EXISTING paragraph. You cannot insert text at arbitrary indices or at structural boundaries (e.g., table starts). The index must also be strictly less than the document's end index. To safely append text without index concerns, use append_to_end=true. |
| GOOGLEDOCS_LIST_SPREADSHEET_CHARTS | Tool to retrieve a list of all charts from a specified Google Sheets spreadsheet. Use when you need to get chart IDs and their specifications for embedding or referencing elsewhere, such as in Google Docs. |
| GOOGLEDOCS_REPLACE_ALL_TEXT | Tool to replace all occurrences of a specified text string with another text string throughout a Google Document. Use when you need to perform a global find and replace operation within a document. |
| GOOGLEDOCS_REPLACE_IMAGE | Tool to replace a specific image in a document with a new image from a URI. Use when you need to update an existing image within a Google Doc. |
| GOOGLEDOCS_SEARCH_DOCUMENTS | Search for Google Documents using various filters including name, content, date ranges, and more. |
| GOOGLEDOCS_UNMERGE_TABLE_CELLS | Tool to unmerge previously merged cells in a table. Use this when you need to revert merged cells in a Google Document table back to their individual cell states. |
| GOOGLEDOCS_UPDATE_DOCUMENT_BATCH | DEPRECATED: Use UpdateExistingDocument instead. Tool to apply one or more updates to a Google Document. Use when you need to perform batch operations on a document, such as inserting text, updating styles, or modifying document structure. Supports 35+ request types including insertText, replaceAllText, updateTextStyle, createParagraphBullets, insertTable, createHeader/Footer, and more. Each request is validated before being applied. If any request is invalid, the entire operation fails and nothing is applied. |
| GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN | Replaces the entire content of an existing Google Docs document with new Markdown text; requires edit permissions for the document. |
| GOOGLEDOCS_UPDATE_DOCUMENT_SECTION_MARKDOWN | Tool to insert or replace a section of a Google Docs document with Markdown content. Use when you need to update only a section of a document by specifying start and optional end indices. Supports full Markdown formatting. |
| GOOGLEDOCS_UPDATE_DOCUMENT_STYLE | Tool to update the overall document style, such as page size, margins, and default text direction. Use when you need to modify the global style settings of a Google Document. |
| GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT | Applies programmatic edits, such as text insertion, deletion, or formatting, to a specified Google Doc using the `batchUpdate` API method. |
| GOOGLEDOCS_UPDATE_TABLE_ROW_STYLE | Tool to update the style of a table row in a Google Document. Use when you need to modify the appearance of specific rows within a table, such as setting minimum row height or marking rows as headers. |
