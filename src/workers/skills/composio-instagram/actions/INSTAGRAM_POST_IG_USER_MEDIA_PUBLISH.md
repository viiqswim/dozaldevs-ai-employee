# INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH

**Description**: Tool to publish a media container to an Instagram Business account. This action automatically waits for the container to finish processing before publishing. Rate limited to 25 API-published posts per 24-hour moving window. The publishing process: 1. First, create a media container using INSTAGRAM_CREATE_MEDIA_CONTAINER 2. Call this action with the creation_id - it will automatically poll for FINISHED status 3. Once ready, the media is published and the published media ID is returned For videos/reels, processing may take 30-120 seconds. Images are typically instant.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
