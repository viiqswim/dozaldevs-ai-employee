# FACEBOOK_GET_PAGE_POSTS

**Description**: Retrieves posts from a Facebook Page. Endpoint choice: Uses /{page_id}/feed instead of /posts or /published_posts because: - /feed returns all content on page timeline (page's posts + visitor posts + tagged posts) - /posts returns only posts created by the page itself - /published_posts returns only published posts by the page (excludes scheduled/unpublished) The /feed endpoint provides the most comprehensive view of page activity. Pagination: follow paging.cursors.after or paging.next across multiple calls until no next cursor exists. Throttling: high-volume pagination can trigger Graph API errors 4 and 613; use backoff between requests. API Version: Uses v23.0 (released May 2025). v20.0 and earlier will be deprecated by Meta. See: https://developers.facebook.com/docs/graph-api/changelog

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| required | unknown | No |  |
| properties | unknown | No |  |
