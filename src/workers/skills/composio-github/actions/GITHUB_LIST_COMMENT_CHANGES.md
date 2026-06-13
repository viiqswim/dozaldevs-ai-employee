# GITHUB_LIST_COMMENT_CHANGES

**Description**: Tool to list issue and PR comment changes across an organization's repositories efficiently. Use when monitoring comment activity without per-PR/per-issue polling. Filters organization events to return only comment-related events (IssueCommentEvent, PullRequestReviewCommentEvent, CommitCommentEvent). Note: Events are limited to the past 30 days and up to 300 events per timeline. Use ETag header for efficient polling to avoid rate limits.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
| description | unknown | No |  |
