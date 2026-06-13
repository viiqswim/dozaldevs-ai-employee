# EXCEL_CLOSE_SESSION

**Description**: Tool to close an existing Excel workbook session. Use when you need to explicitly end a persistent session to release workbook locks. Note: The Microsoft Graph closeSession API is idempotent - it returns 204 for both active and already-closed sessions. This action validates the session first and returns an error for invalid or already-closed sessions to provide clearer user feedback. The validation uses refreshSession which is the only API endpoint that can detect closed sessions.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
