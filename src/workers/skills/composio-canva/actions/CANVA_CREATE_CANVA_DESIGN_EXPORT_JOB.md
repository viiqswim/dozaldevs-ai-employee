# CANVA_CREATE_CANVA_DESIGN_EXPORT_JOB

**Description**: DEPRECATED: Use CANVA_POST_EXPORTS instead. Exports a Canva design to various file formats. This endpoint initiates an asynchronous export job for designs. Supports image formats (PNG, JPG, GIF), documents (PDF, PPTX), and video (MP4). Each format has specific configuration options like dimensions, quality, and page selection. IMPORTANT: This is an async operation. Use GET_DESIGN_EXPORT_JOB_RESULT to poll the job status until completion and retrieve the download URLs for the exported files.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
