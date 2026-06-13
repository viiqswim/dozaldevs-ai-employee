# INSTAGRAM_CREATE_POST

**Description**: DEPRECATED: Use INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH instead. Publish a draft media container to Instagram (final publishing step). Posts become immediately and publicly visible upon success — confirm intent before calling. Requires Business or Creator account with publish scopes; missing scopes return Graph error code 10. After creating a media container, Instagram may need time to process media before publishing. If called too early, error code 9007 is returned. This action automatically retries with exponential backoff (up to ~44 seconds total). For large videos, use INSTAGRAM_GET_POST_STATUS to poll until status_code='FINISHED' before calling; for carousels, all child containers must individually reach FINISHED status first. No native scheduling support — use an external scheduler to trigger this call at the desired time.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
