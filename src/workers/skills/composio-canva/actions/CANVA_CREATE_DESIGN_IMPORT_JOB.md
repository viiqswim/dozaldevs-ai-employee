# CANVA_CREATE_DESIGN_IMPORT_JOB

**Description**: Imports an external file as a new Canva design. This endpoint converts documents (PDF, Word, PowerPoint, Excel) and design files (PSD, AI) into editable Canva designs. The import runs asynchronously and returns a job ID to track progress and retrieve the created design. IMPORTANT: This is an async operation. Use CANVA_RETRIEVE_DESIGN_IMPORT_JOB_STATUS to poll the job status until it reaches 'success' or 'failed' to get the final design ID.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
