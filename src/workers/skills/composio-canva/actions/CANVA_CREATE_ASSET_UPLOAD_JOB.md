# CANVA_CREATE_ASSET_UPLOAD_JOB

**Description**: Uploads an asset file to the user's Canva content library. This endpoint initiates an asynchronous upload job for images, videos, audio files, PDFs, or fonts. Returns a job ID to track the upload progress. Once complete, the asset can be used in designs, referenced by its asset ID, and managed through other asset endpoints. IMPORTANT: This is an async operation. Use CANVA_FETCH_ASSET_UPLOAD_JOB_STATUS to poll the job status until it reaches 'success' or 'failed' status.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
