# FACEBOOK_LIST_MANAGED_PAGES

**Description**: Retrieves a list of Facebook Pages that the user manages (not personal profiles), including page details, access tokens, and tasks. Requires `pages_show_list` or `pages_read_engagement` OAuth scopes; missing scopes silently return empty results rather than an error. An empty `data` array means the user manages no Pages. Results are paginated via `paging.cursors`; follow `paging.next` until absent to retrieve all Pages when count exceeds `limit`. Graph API throttling (error codes 4, 17, 613) can occur during pagination — use exponential backoff.

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | unknown | No |  |
| title | unknown | No |  |
| properties | unknown | No |  |
