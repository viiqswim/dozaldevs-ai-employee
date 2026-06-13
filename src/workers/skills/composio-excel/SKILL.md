---
name: composio-excel
description: 'Use when working with Excel via the Composio integration — reading, writing, or managing Excel content. Requires Excel to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Excel

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| EXCEL_ADD_CHART | Add a chart to a worksheet using Microsoft Graph API. |
| EXCEL_ADD_SHAREPOINT_WORKSHEET | Add a new worksheet to a SharePoint Excel workbook using Microsoft Graph Sites API. |
| EXCEL_ADD_TABLE | Create a new table in a worksheet using the Microsoft Graph API. |
| EXCEL_ADD_TABLE_COLUMN | Add a column to a table using Microsoft Graph API. |
| EXCEL_ADD_TABLE_ROW | Add a row to a table using Microsoft Graph API. |
| EXCEL_ADD_WORKBOOK_PERMISSION | Tool to grant access to a workbook via invite. Use when you need to share a specific workbook file with designated recipients and roles. |
| EXCEL_ADD_WORKSHEET | Add a new worksheet to an Excel workbook using Microsoft Graph API. |
| EXCEL_APPLY_TABLE_FILTER | Apply a filter to a table column using Microsoft Graph API. |
| EXCEL_APPLY_TABLE_SORT | Apply a sort to a table using Microsoft Graph API. |
| EXCEL_CLEAR_RANGE | Tool to clear values, formats, or contents in a specified worksheet range. Use when you need to reset cells before adding new data. |
| EXCEL_CLEAR_TABLE_FILTER | Clear a filter from a table column using Microsoft Graph API. |
| EXCEL_CLOSE_SESSION | Tool to close an existing Excel workbook session. Use when you need to explicitly end a persistent session to release workbook locks. Note: The Microsoft Graph closeSession API is idempotent - it returns 204 for both active and already-closed sessions. This action validates the session first and returns an error for invalid or already-closed sessions to provide clearer user feedback. The validation uses refreshSession which is the only API endpoint that can detect closed sessions. |
| EXCEL_CONVERT_TABLE_TO_RANGE | Convert a table to a range using Microsoft Graph API. |
| EXCEL_CREATE_WORKBOOK | Tool to create a new Excel workbook file at a specified drive path. Generates a new .xlsx file with specified worksheets and data, then uploads it to OneDrive. |
| EXCEL_DELETE_TABLE_COLUMN | Delete a column from a table using Microsoft Graph API. |
| EXCEL_DELETE_TABLE_ROW | Delete a row from a table using Microsoft Graph API. |
| EXCEL_DELETE_WORKSHEET | Tool to delete a worksheet from the workbook. Use when cleaning up unused or temporary sheets after verifying no dependencies exist. Example: "Delete 'Sheet2' after review." |
| EXCEL_EXPORT_WORKBOOK_TO_PDF | Tool to export an Excel workbook to PDF via Microsoft Graph's format conversion. Use when you need a PDF version of an Excel file for sending, storing, or attaching. |
| EXCEL_GET_CHART_AXIS | Tool to retrieve a specific axis from a chart. Use when you need properties like min, max, interval, and formatting of the chart axis. |
| EXCEL_GET_CHART_DATA_LABELS | Tool to retrieve the data labels object of a chart. Use when you need to inspect label settings like position, separator, and visibility flags after creating or updating a chart. |
| EXCEL_GET_CHART_LEGEND | Tool to retrieve the legend object of a chart. Use after creating or updating a chart when you need to inspect legend visibility and formatting. |
| EXCEL_GET_RANGE | Get a range from a worksheet using Microsoft Graph API. |
| EXCEL_GET_SESSION | Create a session for an Excel workbook using Microsoft Graph API. |
| EXCEL_GET_SHAREPOINT_RANGE | Get a range from a worksheet in SharePoint using Microsoft Graph Sites API. |
| EXCEL_GET_SHAREPOINT_WORKSHEET | Get a worksheet by name or ID from a SharePoint Excel workbook using Microsoft Graph Sites API. |
| EXCEL_GET_TABLE_COLUMN | Tool to retrieve a specific column from a workbook table. Use when you need to fetch column properties and data by its ID or name. |
| EXCEL_GET_WORKBOOK | Tool to retrieve the properties and relationships of a workbook. Use when you need to inspect comments, names, tables, or worksheets. |
| EXCEL_GET_WORKSHEET | Get a worksheet by name or ID from an Excel workbook using Microsoft Graph API. |
| EXCEL_GET_WORKSHEET_USED_RANGE | Tool to retrieve a worksheet's used range (active data region) without specifying a fixed range address. Use when you need to read all data from a sheet but don't know the exact range. The valuesOnly option helps filter out formatting-only cells. |
| EXCEL_INSERT_RANGE | Tool to insert a new cell range into a worksheet, shifting existing cells down or right. Use when you need to create space for new content without overwriting. |
| EXCEL_LIST_CHARTS | List charts in a worksheet using Microsoft Graph API. |
| EXCEL_LIST_CHART_SERIES | Tool to list all data series in a chart. Use when you need to enumerate chart series for further analysis. |
| EXCEL_LIST_COMMENTS | Tool to list comments in an Excel workbook. Use when you need to retrieve all workbook comments via Microsoft Graph API. |
| EXCEL_LIST_DRIVE_ITEM_CHILDREN | Tool to list immediate children (files/folders) of a folder DriveItem using driveId and itemId. Returns an array of child DriveItems with stable identifiers and pagination support. |
| EXCEL_LIST_FILES | List files and folders in a drive root or specified path. |
| EXCEL_LIST_NAMED_ITEMS | List named items in a workbook using Microsoft Graph API. |
| EXCEL_LIST_SHAREPOINT_TABLES | List tables in a SharePoint worksheet using Microsoft Graph Sites API. |
| EXCEL_LIST_SHAREPOINT_WORKSHEETS | List worksheets in an Excel workbook stored in SharePoint using Microsoft Graph Sites API. |
| EXCEL_LIST_TABLE_COLUMNS | List columns in a table using Microsoft Graph API. |
| EXCEL_LIST_TABLE_ROWS | List rows in a table using Microsoft Graph API. |
| EXCEL_LIST_TABLES | List tables in a worksheet using Microsoft Graph API. This action retrieves information about all tables present in a specified worksheet of an Excel file. It requires the file ID and worksheet name or ID, and can optionally use a session ID for workbook operations. |
| EXCEL_LIST_WORKBOOK_PERMISSIONS | Tool to list permissions set on the workbook file. Use when you need to see which users or links have access to a specific Excel file by supplying its drive and item IDs. Example: "List permissions for workbook with drive_id 'b!abc123' and item_id '0123456789abcdef'." |
| EXCEL_LIST_WORKSHEETS | List worksheets in an Excel workbook using Microsoft Graph API. |
| EXCEL_MERGE_CELLS | Merge cells in a worksheet range using Microsoft Graph API. |
| EXCEL_PROTECT_WORKSHEET | Tool to protect a worksheet using optional protection options. Use when you need to prevent editing certain parts of a sheet before sharing. Example: "Protect 'Sheet1' to lock formatting and sorting." |
| EXCEL_SEARCH_FILES | Tool to search OneDrive drive items by query to discover Excel workbook IDs. Use when you need to find Excel files by name before performing workbook operations. |
| EXCEL_SORT_RANGE | Sort a range in a worksheet using Microsoft Graph API. |
| EXCEL_UPDATE_CHART | Update a chart in a worksheet using Microsoft Graph API. |
| EXCEL_UPDATE_CHART_LEGEND | Tool to update formatting or position of a chart legend. Use when adjusting legend settings after confirming chart and worksheet exist. |
| EXCEL_UPDATE_RANGE | Update a range in a worksheet using Microsoft Graph API. |
| EXCEL_UPDATE_SHAREPOINT_RANGE | Update a range in a SharePoint worksheet using Microsoft Graph Sites API. |
| EXCEL_UPDATE_TABLE | Update a table in a workbook using Microsoft Graph API. |
| EXCEL_UPDATE_WORKSHEET | Update worksheet properties (name, position) in an Excel workbook using Microsoft Graph API. |
| EXCEL_UPLOAD_WORKBOOK | Tool to upload an external Excel file from a URL into OneDrive/SharePoint. Downloads the file server-side and uploads it to the specified drive location, returning the driveItem metadata for subsequent Excel operations. |
