# INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT

**Description**: Get an Instagram Business Account's current content publishing usage. Use this to monitor quota usage before publishing; exceeding the daily cap blocks new posts until the quota resets (no partial failure — new publish calls are rejected until reset). IMPORTANT: This endpoint requires an IG User ID (Instagram Business Account ID), NOT an IGSID (Instagram Scoped ID). IGSID is only used for messaging-related endpoints. Content publishing endpoints require a proper IG User ID. Excessive polling of this endpoint may trigger Graph error 613 (rate limit); space calls several seconds apart.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
