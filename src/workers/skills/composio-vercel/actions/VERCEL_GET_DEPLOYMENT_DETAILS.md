# VERCEL_GET_DEPLOYMENT_DETAILS

**Description**: DEPRECATED: Use VERCEL_VERCEL_GET_DEPLOYMENT instead. Retrieves detailed information about a specific deployment. Use after triggering a deployment to inspect status and configuration. Poll with exponential backoff (5–30s) since deployments may remain in QUEUED or BUILDING state for minutes; tight polling triggers HTTP 429. Deployment is live only when readyState=READY and errorCode is absent; other states (QUEUED, BUILDING, CANCELED, ERROR) mean no traffic is served. Build failures surface in readyState=ERROR with errorCode and errorMessage fields — successful creation does not guarantee a successful build. Example: { "idOrUrl": "dpl_Br7FSrRXuUkSHj7t7GVVadyuGvFg" }

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
