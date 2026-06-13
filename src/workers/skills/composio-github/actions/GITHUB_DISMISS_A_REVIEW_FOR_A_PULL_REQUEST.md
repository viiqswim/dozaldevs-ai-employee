# GITHUB_DISMISS_A_REVIEW_FOR_A_PULL_REQUEST

**Description**: Dismisses an APPROVED or CHANGES_REQUESTED review on a pull request with a mandatory explanatory message. IMPORTANT: Only reviews in APPROVED or CHANGES_REQUESTED state can be dismissed. Reviews in COMMENTED, PENDING, or already DISMISSED state will return a 422 error. To dismiss a review on a protected branch, you must be a repository admin or be authorized to dismiss pull request reviews.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
