/**
 * Jira Cloud REST API v3 client.
 * Supports two auth modes:
 *   - OAuth 2.0: Bearer token + cloudId URL
 *   - Basic auth: email:apiToken base64 encoded + domain URL
 * All methods retry-on-429 via withRetry().
 */
import { ExternalApiError, RateLimitExceededError } from './errors.js';
import { withRetry } from './retry.js';
import type {
  JiraClientConfig,
  JiraIssue,
  JiraComment,
  JiraSearchResult,
  AdfDocument,
} from './jira-types.js';
import { JIRA_OAUTH_BASE_URL } from './jira-types.js';

/** Legacy flat config format — preserved for backward compatibility with existing tests. */
interface LegacyJiraClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraClient {
  getIssue(issueKey: string): Promise<JiraIssue>;
  addComment(issueKey: string, body: string): Promise<void>;
  transitionIssue(issueKey: string, transitionId: string): Promise<void>;
  searchIssues(
    jql: string,
    fields?: string[],
    startAt?: number,
    maxResults?: number,
  ): Promise<JiraSearchResult>;
  getComments(
    issueKey: string,
    startAt?: number,
    maxResults?: number,
  ): Promise<{ comments: JiraComment[]; total: number }>;
}

/**
 * Create a Jira Cloud REST API v3 client.
 *
 * Accepts either:
 *   - New format: `{ auth: { accessToken, cloudId } }` for OAuth 2.0
 *   - New format: `{ auth: { email, apiToken, baseUrl } }` for Basic auth
 *   - Legacy format: `{ baseUrl, email, apiToken }` for backward compatibility
 */
export function createJiraClient(config: JiraClientConfig | LegacyJiraClientConfig): JiraClient {
  // Normalize config into a resolved base URL and auth header.
  let resolvedBaseUrl: string;
  let resolvedAuthHeader: string;

  if ('auth' in config) {
    const { auth } = config;
    if ('accessToken' in auth) {
      resolvedBaseUrl = `${JIRA_OAUTH_BASE_URL}/${auth.cloudId}/rest/api/3`;
      resolvedAuthHeader = `Bearer ${auth.accessToken}`;
    } else {
      resolvedBaseUrl = `${auth.baseUrl}/rest/api/3`;
      resolvedAuthHeader = `Basic ${btoa(`${auth.email}:${auth.apiToken}`)}`;
    }
  } else {
    resolvedBaseUrl = `${config.baseUrl}/rest/api/3`;
    resolvedAuthHeader = `Basic ${btoa(`${config.email}:${config.apiToken}`)}`;
  }

  /**
   * Check response status and throw appropriate errors.
   */
  function checkStatus(response: Response, endpoint: string): void {
    if (response.ok) {
      return;
    }

    if (response.status === 429) {
      throw new RateLimitExceededError('Jira API rate limit exceeded', {
        service: 'jira',
        attempts: 1,
        retryAfterMs: parseInt(response.headers.get('Retry-After') || '0', 10) * 1000,
      });
    }

    if (response.status >= 400) {
      throw new ExternalApiError(`Jira API error: ${response.statusText}`, {
        service: 'jira',
        statusCode: response.status,
        endpoint,
      });
    }
  }

  /**
   * Make an HTTP request with retry-on-429.
   */
  async function makeRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    skipBody?: boolean,
  ): Promise<T> {
    return withRetry(
      async () => {
        const url = `${resolvedBaseUrl}${path}`;
        const options: RequestInit = {
          method,
          headers: {
            Authorization: resolvedAuthHeader,
            'Content-Type': 'application/json',
          },
        };

        if (body !== undefined) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        checkStatus(response, path);

        if (skipBody) {
          return undefined as T;
        }

        return (await response.json()) as T;
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        retryOn: (err) => err instanceof RateLimitExceededError,
      },
    );
  }

  return {
    async getIssue(issueKey: string): Promise<JiraIssue> {
      return makeRequest<JiraIssue>('GET', `/issue/${issueKey}`);
    },

    async addComment(issueKey: string, body: string): Promise<void> {
      const adfBody: AdfDocument = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: body }],
          },
        ],
      };
      await makeRequest<void>('POST', `/issue/${issueKey}/comment`, { body: adfBody }, true);
    },

    async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
      await makeRequest<void>(
        'POST',
        `/issue/${issueKey}/transitions`,
        { transition: { id: transitionId } },
        true,
      );
    },

    async searchIssues(
      jql: string,
      fields?: string[],
      startAt = 0,
      maxResults = 50,
    ): Promise<JiraSearchResult> {
      return makeRequest<JiraSearchResult>('POST', '/search/jql', {
        jql,
        fields,
        startAt,
        maxResults,
      });
    },

    async getComments(
      issueKey: string,
      startAt = 0,
      maxResults = 50,
    ): Promise<{ comments: JiraComment[]; total: number }> {
      const params = new URLSearchParams({
        startAt: String(startAt),
        maxResults: String(maxResults),
      });
      return makeRequest<{ comments: JiraComment[]; total: number }>(
        'GET',
        `/issue/${issueKey}/comment?${params.toString()}`,
      );
    },
  };
}
