# GITHUB_MERGE_A_PULL_REQUEST

**Description**: Merges an open and mergeable pull request in a repository. A 405 error can occur for multiple reasons: (1) The PR is still in draft mode - convert it to ready-for-review first using GITHUB_UPDATE_A_PULL_REQUEST. (2) Branch protection rules are not satisfied - check for required approving reviews, status checks, or other repository rules that must be met before merging. (3) The base branch has been modified since the PR was last synced - update the PR branch first using GITHUB_UPDATE_A_PULL_REQUEST_BRANCH.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
