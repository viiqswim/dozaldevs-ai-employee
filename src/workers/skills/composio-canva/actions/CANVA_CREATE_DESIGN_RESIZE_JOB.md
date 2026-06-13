# CANVA_CREATE_DESIGN_RESIZE_JOB

**Description**: Creates a resized copy of an existing design (Canva Pro/Enterprise only). This endpoint creates a new design with different dimensions from an existing one. The resize operation runs asynchronously and preserves content where possible. Returns a job ID to track progress and retrieve the new design once complete. IMPORTANT: This is an async operation. Use CANVA_RETRIEVE_DESIGN_RESIZE_JOB_STATUS to poll the job status until completion to get the resized design ID and access URLs.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
