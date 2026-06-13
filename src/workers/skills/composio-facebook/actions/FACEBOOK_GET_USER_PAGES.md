# FACEBOOK_GET_USER_PAGES

**Description**: DEPRECATED: Use FACEBOOK_LIST_MANAGED_PAGES instead. Retrieves Facebook Pages the user manages (excludes personal profiles, groups, and non-Page entities); an empty `data` array means no manageable Pages exist. Requires `pages_show_list` scope; missing scopes yield empty `data` or OAuthException code 200. Results paginate ~100 items per page — follow `paging.cursors.after` or `next` until exhausted.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
