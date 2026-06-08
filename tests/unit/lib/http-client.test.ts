import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHttpClient } from '../../../src/lib/http-client.js';
import { RateLimitExceededError } from '../../../src/lib/errors.js';

const baseUrl = 'https://example.com';
const defaultHeaders = {
  Authorization: 'Bearer test-token',
  'Content-Type': 'application/json',
};

describe('createHttpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('makes POST request to baseUrl + path with default headers and JSON body', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const http = createHttpClient(baseUrl, defaultHeaders, { service: 'test' });
    await http.post('/api/action', { key: 'value' });

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api/action', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ key: 'value' }),
    });
  });

  it('returns the Response on success', async () => {
    const payload = { result: 'done' };
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    const http = createHttpClient(baseUrl, defaultHeaders, { service: 'test' });
    const response = await http.post('/api/action', {});

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(payload);
  });

  it('throws RateLimitExceededError on 429', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, statusText: 'Too Many Requests' }));

    const http = createHttpClient(baseUrl, defaultHeaders, {
      service: 'test',
      maxAttempts: 1,
    });

    await expect(http.post('/api/action', {})).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('parses Retry-After header into retryAfterMs on 429', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '30' },
      }),
    );

    const http = createHttpClient(baseUrl, defaultHeaders, {
      service: 'test',
      maxAttempts: 1,
    });

    try {
      await http.post('/api/action', {});
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError);
      expect((err as RateLimitExceededError).retryAfterMs).toBe(30000);
      expect((err as RateLimitExceededError).service).toBe('test');
    }
  });

  it('retryAfterMs is undefined when Retry-After header is absent', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, statusText: 'Too Many Requests' }));

    const http = createHttpClient(baseUrl, defaultHeaders, {
      service: 'test',
      maxAttempts: 1,
    });

    try {
      await http.post('/api/action', {});
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError);
      expect((err as RateLimitExceededError).retryAfterMs).toBeUndefined();
    }
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    vi.useFakeTimers();

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, statusText: 'Too Many Requests' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const http = createHttpClient(baseUrl, defaultHeaders, {
      service: 'test',
      maxAttempts: 3,
      baseDelayMs: 1000,
    });

    const resultPromise = http.post('/api/action', {});
    await vi.advanceTimersByTimeAsync(2000);
    const response = await resultPromise;

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('passes non-429 error responses through without throwing', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: 'bad_request' }), { status: 400 }),
      );

    const http = createHttpClient(baseUrl, defaultHeaders, { service: 'test' });
    const response = await http.post('/api/action', {});

    expect(response.status).toBe(400);
  });
});
