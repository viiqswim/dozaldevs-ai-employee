export type NotionAuth = {
  headers: Record<string, string>;
  mode: 'oauth' | 'api_key';
};

export function resolveNotionAuth(): NotionAuth {
  const accessToken = process.env['NOTION_ACCESS_TOKEN'];

  if (accessToken) {
    return {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      mode: 'oauth',
    };
  }

  const apiKey = process.env['NOTION_API_KEY'];

  if (apiKey) {
    return {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      mode: 'api_key',
    };
  }

  process.stderr.write(
    'Error: Notion credentials not configured. Either:\n' +
      '  (1) Connect Notion via dashboard → Tenant → Integrations → Connect Notion\n' +
      '  (2) Set notion_access_token as a tenant secret via admin API\n',
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const auth = resolveNotionAuth();
  process.stdout.write(JSON.stringify(auth) + '\n');
}
