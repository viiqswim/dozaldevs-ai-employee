---
name: composio-pandadoc
description: 'Use when working with Pandadoc via the Composio integration — reading, writing, or managing Pandadoc content. Requires Pandadoc to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Pandadoc

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| PANDADOC_CREATE_DOCUMENT_ATTACHMENT | Creates and adds an attachment to a PandaDoc document. This tool allows you to attach downloadable files such as supplemental materials, Excel spreadsheets, or other content without embedding them directly into the document. Attachments can be added only to documents in 'document.draft' status, with a maximum of 10 files per document and a size limit of 50MB per file. |
| PANDADOC_CREATE_DOCUMENT_FROM_FILE | Creates a new document in PandaDoc by uploading a file (PDF, DOCX, or RTF). Converts existing documents into PandaDoc documents for processing, signing, and tracking. Either `file` or `url` must be provided; omitting both will fail. Large files may time out during upload and conversion. |
| PANDADOC_CREATE_FOLDER | Creates a new folder in PandaDoc to organize documents. This action allows users to create a new folder with a specified name and optionally set a parent folder to create a nested folder structure. |
| PANDADOC_CREATE_OR_UPDATE_CONTACT | This tool creates a new contact or updates an existing one in PandaDoc based on the email address. If a contact with the provided email exists, it will be updated; otherwise, a new contact will be created. |
| PANDADOC_CREATE_TEMPLATE | This tool allows users to create a new template in PandaDoc from a PDF file or from scratch. It handles file upload validation, parameter checks, proper error handling, and authentication with the PandaDoc API. The template can be created either by uploading a PDF file or by providing a structured content object that defines the template layout and elements. |
| PANDADOC_CREATE_WEBHOOK | Creates a new webhook subscription in PandaDoc to receive notifications about specific events. This action allows you to set up webhook notifications for various document-related events such as status changes, recipient completions, and updates. The webhook will send HTTP notifications to your specified endpoint when the configured events occur. |
| PANDADOC_DELETE_CONTACT | This tool allows you to delete a contact from your PandaDoc account. The action is permanent and cannot be undone. |
| PANDADOC_DELETE_TEMPLATE | This tool deletes a specific template from PandaDoc. Once a template is deleted, it cannot be recovered. This action is permanent and should be used with caution. |
| PANDADOC_GET_DOCUMENT_DETAILS | Fetch detailed metadata for a specific PandaDoc document including recipients, fields/tokens values, pricing data, metadata, tags, and content-block names. Use this after discovering a document via list/search to inspect recipients/status/fields/metadata/content-block references for follow-up automation or reporting. |
| PANDADOC_GET_TEMPLATE_DETAILS | This tool retrieves detailed information about a specific template by its ID. The endpoint returns comprehensive template details including metadata, content details, and sharing settings. |
| PANDADOC_LIST_CONTACTS | List all contacts in your PandaDoc workspace. Returns all contacts with their details including email, name, company, and contact information. Optionally filter by exact email address. Note: The API returns all contacts at once without pagination - filtering and pagination should be done client-side if needed. |
| PANDADOC_LIST_DOCUMENT_FOLDERS | This tool retrieves a list of all document folders in PandaDoc. It's a standalone action that doesn't require any external dependencies or resource IDs. The tool will return a list of folders containing documents, with each folder containing information about its ID, name, and parent folder relationship. |
| PANDADOC_LIST_TEMPLATES | This tool retrieves a list of all templates available in the PandaDoc account. It supports parameters to filter templates by name, shared status, deleted status, pagination, and tag filtering, and returns detailed template information. |
| PANDADOC_MOVE_DOCUMENT_TO_FOLDER | This tool allows users to move a document to a specific folder within their PandaDoc account. It performs a POST request to move the document to the specified folder. Both the document and the destination folder must exist. Only documents in draft status can be moved; attempting to move documents in sent, completed, or other non-draft states will fail. |
