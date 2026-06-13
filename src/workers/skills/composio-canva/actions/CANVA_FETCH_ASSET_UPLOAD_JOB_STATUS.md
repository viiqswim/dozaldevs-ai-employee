# CANVA_FETCH_ASSET_UPLOAD_JOB_STATUS

**Description**: Polls for asset upload job completion status. Use this after CANVA_CREATE_ASSET_UPLOAD_JOB to check the upload progress. Repeatedly call this endpoint until a 'success' or 'failed' status is received to get the final asset ID and metadata. IMPORTANT: This tool is ONLY for direct file upload jobs (CANVA_CREATE_ASSET_UPLOAD_JOB). Do NOT use this for URL import jobs created by CANVA_CREATE_URL_ASSET_UPLOAD_JOB - those use a different API endpoint. Use CANVA_GET_URL_ASSET_UPLOADS_JOBID to poll URL import job status.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
