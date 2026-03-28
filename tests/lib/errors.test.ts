import { describe, it, expect } from 'vitest';
import {
  LLMTimeoutError,
  CostCircuitBreakerError,
  RateLimitExceededError,
  ExternalApiError,
} from '../../src/lib/errors.js';

describe('LLMTimeoutError', () => {
  it('is an instance of Error with correct name and properties', () => {
    const error = new LLMTimeoutError('Timeout occurred', {
      timeoutMs: 30000,
      model: 'gpt-4',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LLMTimeoutError');
    expect(error.message).toBe('Timeout occurred');
    expect(error.timeoutMs).toBe(30000);
    expect(error.model).toBe('gpt-4');
  });

  it('has a stack trace', () => {
    const error = new LLMTimeoutError('Timeout', { timeoutMs: 5000, model: 'gpt-3.5' });
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });
});

describe('CostCircuitBreakerError', () => {
  it('is an instance of Error with correct name and properties', () => {
    const error = new CostCircuitBreakerError('Cost limit exceeded', {
      department: 'engineering',
      currentSpendUsd: 150,
      limitUsd: 100,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CostCircuitBreakerError');
    expect(error.message).toBe('Cost limit exceeded');
    expect(error.department).toBe('engineering');
    expect(error.currentSpendUsd).toBe(150);
    expect(error.limitUsd).toBe(100);
  });

  it('has a stack trace', () => {
    const error = new CostCircuitBreakerError('Cost exceeded', {
      department: 'sales',
      currentSpendUsd: 200,
      limitUsd: 150,
    });
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });
});

describe('RateLimitExceededError', () => {
  it('is an instance of Error with correct name and properties', () => {
    const error = new RateLimitExceededError('Rate limit hit', {
      service: 'openai',
      attempts: 3,
      retryAfterMs: 60000,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RateLimitExceededError');
    expect(error.message).toBe('Rate limit hit');
    expect(error.service).toBe('openai');
    expect(error.attempts).toBe(3);
    expect(error.retryAfterMs).toBe(60000);
  });

  it('has optional retryAfterMs property', () => {
    const error = new RateLimitExceededError('Rate limit', {
      service: 'anthropic',
      attempts: 2,
    });

    expect(error.retryAfterMs).toBeUndefined();
  });

  it('has a stack trace', () => {
    const error = new RateLimitExceededError('Rate limit', {
      service: 'api',
      attempts: 1,
    });
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });
});

describe('ExternalApiError', () => {
  it('is an instance of Error with correct name and properties', () => {
    const error = new ExternalApiError('API request failed', {
      service: 'stripe',
      statusCode: 500,
      endpoint: '/v1/charges',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ExternalApiError');
    expect(error.message).toBe('API request failed');
    expect(error.service).toBe('stripe');
    expect(error.statusCode).toBe(500);
    expect(error.endpoint).toBe('/v1/charges');
  });

  it('has a stack trace', () => {
    const error = new ExternalApiError('API error', {
      service: 'github',
      statusCode: 403,
      endpoint: '/repos/owner/repo',
    });
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });
});
