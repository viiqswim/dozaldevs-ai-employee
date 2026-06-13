# INSTAGRAM_GET_POST_STATUS

**Description**: DEPRECATED: Use GetIgMedia instead. Check the processing status of a draft post container. Poll until status_code='FINISHED' before calling INSTAGRAM_CREATE_POST; publishing early triggers OAuthException 9007 (HTTP 400). If status_code='ERROR' or remains non-terminal after ~30 attempts, the container is permanently failed — recreate a new container. Poll every 3–5s with exponential backoff to avoid error 613/code 4/HTTP 429. For carousels, all child containers must reach FINISHED before publishing the parent.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
