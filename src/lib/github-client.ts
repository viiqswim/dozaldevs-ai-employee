/**
 * GitHub REST API client.
 * CRITICAL: GitHub returns 403 (not 429) for primary rate limits.
 * Both 429 and 403 with X-RateLimit-Remaining: 0 are treated as rate limits.
 */
import { ExternalApiError, RateLimitExceededError } from './errors.js';
import { withRetry } from './retry.js';

export interface GitHubClientConfig {
  token: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  state: string;
  body?: string | null;
}

export interface CreatePRParams {
  owner: string;
  repo: string;
  title: string;
  head: string; // branch name
  base: string; // target branch
  body?: string;
}

export interface ListPRsParams {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  head?: string; // filter by head branch
}

export interface GetPRParams {
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface GitHubClient {
  createPR(params: CreatePRParams): Promise<GitHubPR>;
  listPRs(params: ListPRsParams): Promise<GitHubPR[]>;
  getPR(params: GetPRParams): Promise<GitHubPR>;
}

/**
 * Detect if a response is a rate limit error.
 * GitHub returns 429 for secondary rate limits and 403 for primary rate limits.
 */
function isRateLimit(response: Response): boolean {
  if (response.status === 429) return true;
  if (response.status === 403) {
    return response.headers.get('X-RateLimit-Remaining') === '0';
  }
  return false;
}

/**
 * Calculate retry delay from X-RateLimit-Reset header (Unix epoch seconds).
 * Returns milliseconds to wait from now.
 */
function getRetryAfterMs(response: Response): number | undefined {
  const resetHeader = response.headers.get('X-RateLimit-Reset');
  if (!resetHeader) return undefined;

  const resetEpochSeconds = parseInt(resetHeader, 10);
  if (isNaN(resetEpochSeconds)) return undefined;

  const resetMs = resetEpochSeconds * 1000;
  const nowMs = Date.now();
  const delayMs = Math.max(0, resetMs - nowMs);

  return delayMs;
}

/**
 * Create a GitHub REST API client.
 */
export function createGitHubClient(config: GitHubClientConfig): GitHubClient {
  const baseUrl = 'https://api.github.com';
  const token = config.token;

  /**
   * Make an authenticated request to the GitHub API.
   * Handles rate limit detection and throws appropriate errors.
   */
  async function makeRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Check for rate limit before checking status
    if (isRateLimit(response)) {
      const retryAfterMs = getRetryAfterMs(response);
      throw new RateLimitExceededError(`GitHub API rate limit exceeded on ${method} ${path}`, {
        service: 'github',
        attempts: 1,
        retryAfterMs,
      });
    }

    // Check for other errors
    if (!response.ok) {
      throw new ExternalApiError(
        `GitHub API error: ${response.status} ${response.statusText} on ${method} ${path}`,
        {
          service: 'github',
          statusCode: response.status,
          endpoint: path,
        },
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Wrapper around makeRequest that applies retry logic.
   */
  async function makeRequestWithRetry<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return withRetry(() => makeRequest<T>(method, path, body), {
      maxAttempts: 3,
      baseDelayMs: 1000,
      retryOn: (error) => error instanceof RateLimitExceededError,
    });
  }

  return {
    async createPR(params: CreatePRParams): Promise<GitHubPR> {
      const path = `/repos/${params.owner}/${params.repo}/pulls`;
      const body = {
        title: params.title,
        head: params.head,
        base: params.base,
        body: params.body,
      };

      return makeRequestWithRetry<GitHubPR>('POST', path, body);
    },

    async listPRs(params: ListPRsParams): Promise<GitHubPR[]> {
      const searchParams = new URLSearchParams();
      if (params.state) searchParams.set('state', params.state);
      if (params.head) searchParams.set('head', params.head);

      const query = searchParams.toString();
      const path = `/repos/${params.owner}/${params.repo}/pulls${query ? `?${query}` : ''}`;

      return makeRequestWithRetry<GitHubPR[]>('GET', path);
    },

    async getPR(params: GetPRParams): Promise<GitHubPR> {
      const path = `/repos/${params.owner}/${params.repo}/pulls/${params.pullNumber}`;

      return makeRequestWithRetry<GitHubPR>('GET', path);
    },
  };
}
