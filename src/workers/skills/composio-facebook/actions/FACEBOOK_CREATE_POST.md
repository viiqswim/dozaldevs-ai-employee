# FACEBOOK_CREATE_POST

**Description**: Creates a new text or link post on a Facebook Page. Requires `pages_manage_posts` permission and manage-level Page role on the target Page. For image posts use FACEBOOK_CREATE_PHOTO_POST; for video posts use FACEBOOK_CREATE_VIDEO_POST — media fields are not supported here. Returns a composite post ID in `PageID_PostID` format, required for FACEBOOK_GET_POST retrieval.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
