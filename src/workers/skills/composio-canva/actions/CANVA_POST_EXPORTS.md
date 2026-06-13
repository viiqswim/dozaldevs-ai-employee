# CANVA_POST_EXPORTS

**Description**: Starts a new asynchronous job to export a Canva design file. Use when exporting designs to various formats (PDF, JPG, PNG, GIF, PPTX, MP4). Returns a job ID that can be used to poll for completion status and download URLs. IMPORTANT: Format compatibility varies by design type. Before exporting, use the CANVA_GET_DESIGNS_DESIGNID_EXPORT_FORMATS action to check which formats are supported for the specific design. Attempting to export in an unsupported format will result in a 400 error (e.g., 'png export not supported for this design type').

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
