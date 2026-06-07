type JiraAuthMode = 'oauth' | 'basic';

interface JiraOAuthConfig {
  accessToken: string;
  cloudId: string;
}

interface JiraBasicConfig {
  email: string;
  apiToken: string;
  baseUrl: string;
}

export interface JiraClientConfig {
  auth: JiraOAuthConfig | JiraBasicConfig;
  mock?: boolean;
}

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  attrs?: Record<string, unknown>;
}

export interface AdfDocument {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: AdfDocument | null;
    status: { name: string };
    priority: { name: string };
    assignee: { displayName: string; accountId: string } | null;
    reporter: { displayName: string; accountId: string };
    labels: string[];
    created: string;
    updated: string;
    project: { key: string; name: string };
  };
}

export interface JiraComment {
  id: string;
  author: { displayName: string; accountId: string };
  body: AdfDocument;
  created: string;
  updated: string;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}

export const JIRA_OAUTH_BASE_URL = 'https://api.atlassian.com/ex/jira';
export const JIRA_AUTH_URL = 'https://auth.atlassian.com/authorize';
export const JIRA_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const JIRA_ACCESSIBLE_RESOURCES_URL =
  'https://api.atlassian.com/oauth/token/accessible-resources';
const JIRA_API_VERSION = '3';
export const JIRA_REQUIRED_SCOPES =
  'read:jira-work write:jira-work read:jira-user manage:jira-webhook offline_access';

function plainTextToAdf(text: string): AdfDocument {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

function adfToPlainText(adf: AdfDocument | null): string {
  if (!adf) return '';

  const texts: string[] = [];

  const extractText = (nodes: AdfNode[] | undefined): void => {
    if (!nodes) return;
    for (const node of nodes) {
      if (typeof node.text === 'string') {
        texts.push(node.text);
      }
      extractText(node.content);
    }
  };

  extractText(adf.content);
  return texts.join('');
}
