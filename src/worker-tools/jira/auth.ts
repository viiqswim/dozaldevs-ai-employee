export type JiraAuth = {
  headers: Record<string, string>;
  baseUrl: string;
  mode: 'oauth' | 'basic';
};

export function resolveJiraAuth(): JiraAuth {
  const accessToken = process.env['JIRA_ACCESS_TOKEN'];
  const cloudId = process.env['JIRA_CLOUD_ID'];

  if (accessToken && cloudId) {
    return {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      baseUrl: `https://api.atlassian.com/ex/jira/${cloudId}`,
      mode: 'oauth',
    };
  }

  const apiToken = process.env['JIRA_API_TOKEN'];
  const email = process.env['JIRA_USER_EMAIL'];
  const baseUrl = process.env['JIRA_BASE_URL'];

  if (apiToken && email && baseUrl) {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    return {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      baseUrl,
      mode: 'basic',
    };
  }

  process.stderr.write(
    'Error: Jira credentials not configured. Set either:\n' +
      '  OAuth:  JIRA_ACCESS_TOKEN + JIRA_CLOUD_ID\n' +
      '  Basic:  JIRA_API_TOKEN + JIRA_USER_EMAIL + JIRA_BASE_URL\n',
  );
  process.exit(1);
}
