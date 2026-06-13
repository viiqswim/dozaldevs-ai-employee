# VERCEL_DELETE_DEPLOYMENT

**Description**: Permanently delete a Vercel deployment by its ID or URL. Use this action to remove a deployment from Vercel. The deployment can be identified either by its unique deployment ID (e.g., 'dpl_xxx') or by providing the deployment URL as a query parameter. Note: This action is destructive and cannot be undone. The deployment will be permanently removed. Do not target the latest production deployment. When filtering deployments by branch or status before deletion, use `meta.githubCommitRef` for branch and `readyState` for status — misreading these fields can cause unintended deletions.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
