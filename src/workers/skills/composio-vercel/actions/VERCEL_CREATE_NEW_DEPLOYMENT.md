# VERCEL_CREATE_NEW_DEPLOYMENT

**Description**: Tool to create a new deployment. Use when you need to deploy files or a Git commit to a Vercel project. Example for file deployment: { "name": "my-app", "files": [ {"file": "index.html", "data": "<html><body>Hello World</body></html>"}, {"file": "style.css", "data": "body { font-family: Arial; }"} ], "target": "production" } Example for Git source deployment (deploy from GitHub branch - uses latest commit): { "name": "my-app", "gitSource": { "type": "github", "repoId": "668449998", "ref": "main" } } Example for Git source deployment (deploy specific commit): { "name": "my-app", "gitSource": { "type": "github", "repoId": "668449998", "ref": "main", "sha": "a1b2c3d4e5f6g7h8i9j0" } } Note: repoId must be the numeric GitHub repository ID (NOT 'owner/repo'). Get it via: GET https://api.github.com/repos/{owner}/{repo} -> use the 'id' field. Example for redeployment: { "deploymentId": "dpl_Br7FSrRXuUkSHj7t7GVVadyuGvFg", "target": "production" }

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
| additionalProperties | unknown | No |  |
