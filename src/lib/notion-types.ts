// Notion OAuth uses the page picker to control access — NOT scopes.
// The user selects which pages/databases to share during the OAuth flow.
// `owner=user` is required (not `workspace`) — the PM may not be a workspace admin.
export const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';

// Token exchange uses HTTP Basic auth: Authorization: Basic base64(clientId:clientSecret)
// NOT a JSON body like Jira — the client credentials go in the Authorization header.
export const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

// Required on every Notion API call as the `Notion-Version` header.
export const NOTION_API_VERSION = '2022-06-28';
