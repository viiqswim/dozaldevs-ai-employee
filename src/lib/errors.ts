/**
 * Custom error types for Phase 4 execution infrastructure.
 * All errors set this.name for correct instanceof behavior after serialization.
 */

/**
 * Thrown when callLLM() exceeds the configured timeout.
 */
export class LLMTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly model: string;

  constructor(message: string, params: { timeoutMs: number; model: string }) {
    super(message);
    this.name = 'LLMTimeoutError';
    this.timeoutMs = params.timeoutMs;
    this.model = params.model;
  }
}

/**
 * Thrown when daily LLM spend for a department exceeds the configured limit.
 */
export class CostCircuitBreakerError extends Error {
  readonly department: string;
  readonly currentSpendUsd: number;
  readonly limitUsd: number;

  constructor(
    message: string,
    params: { department: string; currentSpendUsd: number; limitUsd: number },
  ) {
    super(message);
    this.name = 'CostCircuitBreakerError';
    this.department = params.department;
    this.currentSpendUsd = params.currentSpendUsd;
    this.limitUsd = params.limitUsd;
  }
}

/**
 * Thrown after exhausting all retry attempts on a 429 rate limit response.
 */
export class RateLimitExceededError extends Error {
  readonly service: string;
  readonly attempts: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    params: { service: string; attempts: number; retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'RateLimitExceededError';
    this.service = params.service;
    this.attempts = params.attempts;
    this.retryAfterMs = params.retryAfterMs;
  }
}

/**
 * Thrown when an external API returns a non-2xx, non-rate-limit error.
 */
export class ExternalApiError extends Error {
  readonly service: string;
  readonly statusCode: number;
  readonly endpoint: string;

  constructor(message: string, params: { service: string; statusCode: number; endpoint: string }) {
    super(message);
    this.name = 'ExternalApiError';
    this.service = params.service;
    this.statusCode = params.statusCode;
    this.endpoint = params.endpoint;
  }
}
