# GITHUB_COMMIT_MULTIPLE_FILES

**Description**: Tool to atomically create, update, or delete multiple files in a GitHub repository as a single commit. Uses Git Data APIs to avoid SHA mismatch conflicts that occur with the Contents API when multiple files are modified in parallel. Use when you need to make multi-file changes reliably. BRANCH CREATION: When committing to a new branch (e.g., 'fix/my-fix' or 'feature/new-feature'), you MUST provide 'base_branch' (typically 'main' or 'master') to create the branch from. If the branch already exists, base_branch is not needed. This action handles race conditions automatically: if the branch is updated by another commit between fetching the HEAD and updating the reference (resulting in a 422 'not a fast forward' error), the action will retry by refetching the HEAD and rebasing changes. Use max_retries to control this behavior.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
