/**
 * Jira Cloud REST API v3 client.
 * Uses Basic auth (email:apiToken base64 encoded).
 * All methods retry-on-429 via withRetry().
 */
import { ExternalApiError, RateLimitExceededError } from './errors.js';
import { withRetry } from './retry.js';

export interface JiraClientConfig {
  baseUrl: string; // e.g. "https://your-domain.atlassian.net"
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status?: { name: string } | null;
    assignee?: { displayName: string } | null;
    priority?: { name: string } | null;
  };
}

export interface JiraClient {
  getIssue(issueKey: string): Promise<JiraIssue>;
  addComment(issueKey: string, body: string): Promise<void>;
  transitionIssue(issueKey: string, transitionId: string): Promise<void>;
}

/**
 * Create a Jira Cloud REST API v3 client.
 */
export function createJiraClient(config: JiraClientConfig): JiraClient {
  const { baseUrl, email, apiToken } = config;

  /**
   * Build Basic auth header.
   */
  function getAuthHeader(): string {
    const credentials = `${email}:${apiToken}`;
    const encoded = btoa(credentials);
    return `Basic ${encoded}`;
  }

  /**
   * Make an HTTP request with retry-on-429.
   */
  async function makeRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return withRetry(
      async () => {
        const url = `${baseUrl}${path}`;
        const options: RequestInit = {
          method,
          headers: {
            Authorization: getAuthHeader(),
            'Content-Type': 'application/json',
          },
        };

        if (body) {
          options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        checkStatus(response, path);

        if (method === 'POST' && path.includes('/comment')) {
          // addComment returns 201 with no body
          return undefined as T;
        }

        if (method === 'POST' && path.includes('/transitions')) {
          // transitionIssue returns 204 No Content
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

  return {
    async getIssue(issueKey: string): Promise<JiraIssue> {
      return makeRequest<JiraIssue>('GET', `/rest/api/3/issue/${issueKey}`);
    },

    async addComment(issueKey: string, body: string): Promise<void> {
      await makeRequest<void>('POST', `/rest/api/3/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: body,
                },
              ],
            },
          ],
        },
      });
    },

    async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
      await makeRequest<void>('POST', `/rest/api/3/issue/${issueKey}/transitions`, {
        transition: {
          id: transitionId,
        },
      });
    },
  };
}
