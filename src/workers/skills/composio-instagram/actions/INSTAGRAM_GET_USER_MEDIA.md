# INSTAGRAM_GET_USER_MEDIA

**Description**: DEPRECATED: Use INSTAGRAM_GET_IG_USER_MEDIA instead. Get Instagram user's media (posts, photos, videos). Only works for connected Business or Creator accounts; personal accounts return no data. Response data is nested under `data.data`; unwrap before processing. Items mix images, videos, carousels, and reels — filter by `media_type` and `media_product_type`. Use `media_url` for file download, `permalink` for share links. Fields like `caption`, `like_count` may be null. Timestamps are UTC ISO 8601. HTTP 429 with `Retry-After` header indicates rate limiting.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
