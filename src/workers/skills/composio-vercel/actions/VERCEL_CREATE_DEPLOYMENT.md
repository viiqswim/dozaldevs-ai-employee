# VERCEL_CREATE_DEPLOYMENT

**Description**: DEPRECATED: Use VERCEL_CREATE_NEW_DEPLOYMENT instead. Create a new deployment on Vercel. Deploys static files or connects to a Git repository. **File-based deployments**: Provide `name` and `files` array with file content (inline HTML/CSS/JS). **Git-based deployments**: Provide `name` and `gitSource` with repository details. IMPORTANT: Always provide either `slug` (team slug) or `teamId` (team ID starting with 'team_') to specify the team context. Use VERCEL_GET_TEAMS to find the correct team slug. Example minimal file deployment: { "name": "my-project", "slug": "my-team", "files": [{"file": "index.html", "data": "<html><body>Hello World</body></html>"}] }

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
