/**
 * Shared HTTP client factory.
 * Encapsulates fetch + 429/Retry-After detection + exponential-backoff retry.
 *
 * Usage:
 *   const http = createHttpClient('https://slack.com', {
 *     Authorization: `Bearer ${token}`,
 *     'Content-Type': 'application/json',
 *   }, { service: 'slack' });
 *   const response = await http.post('/api/chat.postMessage', body);
 *   const response = await http.get('/api/resource');
 *   const response = await http.delete('/api/resource/123');
 */
import { RateLimitExceededError } from './errors.js';
import { withRetry, type RetryOptions } from './retry.js';

export interface HttpClientConfig {
  service: string;
  maxAttempts?: number;
  baseDelayMs?: number;
}

/** Optional per-request overrides (e.g. extra/override headers). */
export interface HttpRequestOptions {
  headers?: Record<string, string>;
}

export interface HttpClient {
  post(path: string, body: unknown): Promise<Response>;
  get(path: string, opts?: HttpRequestOptions): Promise<Response>;
  delete(path: string, opts?: HttpRequestOptions): Promise<Response>;
}

function parseRetryAfterMs(headers: Headers): number | undefined {
  const header = headers.get('Retry-After');
  if (!header) return undefined;
  const seconds = parseInt(header, 10);
  return isNaN(seconds) ? undefined : seconds * 1000;
}

export function createHttpClient(
  baseUrl: string,
  defaultHeaders: Record<string, string>,
  config: HttpClientConfig,
): HttpClient {
  const retryOptions: RetryOptions = {
    maxAttempts: config.maxAttempts ?? 3,
    baseDelayMs: config.baseDelayMs ?? 1000,
    retryOn: (err) => err instanceof RateLimitExceededError,
  };

  function handle429(response: Response): void {
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers);
      throw new RateLimitExceededError(
        `${config.service} rate limit exceeded: ${response.statusText}`,
        { service: config.service, attempts: 1, retryAfterMs },
      );
    }
  }

  return {
    post(path: string, body: unknown): Promise<Response> {
      return withRetry(async () => {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: defaultHeaders,
          body: JSON.stringify(body),
        });
        handle429(response);
        return response;
      }, retryOptions);
    },

    get(path: string, opts?: HttpRequestOptions): Promise<Response> {
      return withRetry(async () => {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          headers: { ...defaultHeaders, ...opts?.headers },
        });
        handle429(response);
        return response;
      }, retryOptions);
    },

    delete(path: string, opts?: HttpRequestOptions): Promise<Response> {
      return withRetry(async () => {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'DELETE',
          headers: { ...defaultHeaders, ...opts?.headers },
        });
        handle429(response);
        return response;
      }, retryOptions);
    },
  };
}
