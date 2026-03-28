/**
 * Retry utilities for external API calls.
 * Uses exponential backoff: delay = baseDelayMs * 2^attempt (1s, 2s, 4s by default).
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Predicate to determine if an error is retryable (default: always retry) */
  retryOn?: (error: unknown) => boolean;
}

/**
 * Sleep for a specified number of milliseconds.
 * @example await sleep(1000); // wait 1 second
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 * Delay schedule: baseDelayMs * 2^0, baseDelayMs * 2^1, ..., (no delay after last attempt)
 *
 * @example
 * const result = await withRetry(() => fetch(url), {
 *   maxAttempts: 3,
 *   baseDelayMs: 1000,
 *   retryOn: (err) => err instanceof RateLimitError,
 * });
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const retryOn = options.retryOn ?? (() => true);

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!retryOn(err)) {
        throw err;
      }
      // Don't sleep after the last attempt
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }

  throw lastError;
}
