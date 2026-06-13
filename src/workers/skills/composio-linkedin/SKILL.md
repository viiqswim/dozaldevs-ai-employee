---
name: composio-linkedin
description: 'Use when working with Linkedin via the Composio integration — reading, writing, or managing Linkedin content. Requires Linkedin to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.'
---

# Composio — Linkedin

Full parameter schemas for each action are in `actions/<SLUG>.md`.

## Available Actions

| Action | Description |
|--------|-------------|
| LINKEDIN_CREATE_ARTICLE_OR_URL_SHARE | Tool to create an article or URL share on LinkedIn using the UGC Posts API. Use when you need to share a link with optional commentary on LinkedIn. Supports sharing URLs as articles with customizable visibility settings. |
| LINKEDIN_CREATE_COMMENT_ON_POST | Tool to create a first-level or nested comment on a LinkedIn share, UGC post, or parent comment via the Social Actions Comments API. Use when you need to engage with posts by adding comments or replying to existing comments. Supports text comments with optional @-mentions and image attachments. |
| LINKEDIN_CREATE_LINKED_IN_POST | Creates a new post on LinkedIn for the authenticated user or an organization they manage. Requires w_member_social scope for posting as a person, and w_organization_social scope for posting as an organization (with ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER, or CONTENT_ADMIN role). |
| LINKEDIN_DELETE_LINKED_IN_POST | Deletes a specific LinkedIn post (share) by its unique `share_id`, which must correspond to an existing share. |
| LINKEDIN_DELETE_POST | Delete a LinkedIn post using the Posts API REST endpoint. Supports both ugcPost and share URN formats. The endpoint is idempotent - previously deleted posts return success (204). |
| LINKEDIN_DELETE_UGC_POST | Delete a UGC post using the legacy UGC Post API endpoint. Use when you need to delete a post using the v2/ugcPosts endpoint. Deletion is idempotent - previously deleted posts also return success. |
| LINKEDIN_GET_AD_TARGETING_FACETS | Tool to retrieve available ad targeting facets from LinkedIn Marketing API. Use when you need to discover what targeting options are available for ad campaigns (e.g., locations, industries, job functions). |
| LINKEDIN_GET_AUDIENCE_COUNTS | Retrieves audience size counts for specified targeting criteria. Use when estimating reach for LinkedIn ad campaigns or targeted content. |
| LINKEDIN_GET_COMPANY_INFO | Retrieves organizations where the authenticated user has specific roles (ACLs), to determine their management or content posting capabilities for LinkedIn company pages. |
| LINKEDIN_GET_IMAGE | Tool to retrieve details of a LinkedIn image using its URN. Use when you need to check image status, get download URLs, or access image metadata for a single image. |
| LINKEDIN_GET_IMAGES | Tool to retrieve image metadata including download URLs, status, and dimensions from LinkedIn's Images API. Use when you need to access image details for posts, profiles, or media library assets. |
| LINKEDIN_GET_MY_INFO | Fetches the authenticated LinkedIn user's profile information including name, headline, profile picture, and other profile details. |
| LINKEDIN_GET_NETWORK_SIZE | Tool to retrieve the follower count for a LinkedIn organization. Use when you need to get the number of members following a specific company or organization on LinkedIn. |
| LINKEDIN_GET_ORG_PAGE_STATS | Tool to retrieve page statistics for a LinkedIn organization page. Use when you need engagement metrics like page views and custom button clicks. Supports both lifetime statistics (all-time data segmented by demographics) and time-bound statistics (aggregate data for specific time ranges). Requires rw_organization_admin permission with ADMINISTRATOR role for the organization. |
| LINKEDIN_GET_PERSON | Retrieves a LinkedIn member's profile information by their person ID. Returns lite profile fields (name, profile picture) by default, or basic profile fields (including headline and vanity name) with appropriate permissions. |
| LINKEDIN_GET_POST_CONTENT | Tool to retrieve detailed post content including text, images, videos, and metadata from LinkedIn by post URN. Use when you need to fetch the full content and details of a specific LinkedIn post. |
| LINKEDIN_GET_SHARE_STATS | Retrieves share statistics for a LinkedIn organization, including impressions, clicks, likes, comments, and shares. Use to analyze content performance for an organization page. Optionally filter by time intervals to get time-bound statistics. |
| LINKEDIN_GET_VIDEOS | Retrieves video metadata from LinkedIn Marketing API. Supports single video retrieval, batch retrieval (multiple videos), and finding videos by associated account with pagination. Use when you need to get video details including duration, dimensions, status, download URLs, and media library information. |
| LINKEDIN_INITIALIZE_IMAGE_UPLOAD | Tool to initialize an image upload to LinkedIn and return a presigned upload URL plus the resulting image URN. Use when you need to prepare an image upload for LinkedIn posts. After calling this tool, upload the image bytes to the returned upload_url via PUT request, then use the image URN in CREATE_LINKED_IN_POST action. |
| LINKEDIN_LIST_REACTIONS | Retrieves reactions (likes, celebrations, etc.) on a LinkedIn entity such as a share, post, or comment. Use when you need to see who reacted to content and what type of reactions were used. |
| LINKEDIN_REGISTER_IMAGE_UPLOAD | Tool to initialize a native LinkedIn image upload for feed shares and return a presigned upload URL plus the resulting digital media asset URN. Use when you need to upload an image to attach to a LinkedIn post. After calling this tool, upload the image bytes to the returned upload_url, then use the asset_urn in LINKEDIN_CREATE_LINKED_IN_POST. |
| LINKEDIN_SEARCH_AD_TARGETING_ENTITIES | Search for ad targeting entities using typeahead search. Use when you need to find targeting entities like geographic locations, job titles, industries, or other targeting criteria for LinkedIn ad campaigns. |
