# GITHUB_CREATE_A_REFERENCE

**Description**: Creates a NEW Git reference (branch or tag) in a repository. IMPORTANT: This action ONLY creates NEW references - if the reference already exists, it will fail with a 422 'Reference already exists' error. To update an existing reference, use the 'Update a reference' (GITHUB_UPDATE_A_REFERENCE) action instead. The repository must not be empty prior to this operation.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
