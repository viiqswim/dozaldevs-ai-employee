# INSTAGRAM_CREATE_MEDIA_CONTAINER

**Description**: DEPRECATED: Use INSTAGRAM_POST_IG_USER_MEDIA instead. Creates a draft media container for photos/videos/reels before publishing. Business/Creator accounts only — personal accounts unsupported. Returns a container ID (data.id or data.creation_id) used as creation_id for publishing. Containers expire in ~24 hours — recreate stale containers rather than reusing old IDs. Before publishing via INSTAGRAM_CREATE_POST, call INSTAGRAM_GET_POST_STATUS and wait for FINISHED status — publishing before FINISHED triggers error 9007. Each creation_id is one-time-use; if container creation fails (status_code='ERROR'), fix media params and recreate via this tool rather than retrying publish with the failed ID.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
