import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGitHubClient } from '../../src/lib/github-client.js';
import { ExternalApiError, RateLimitExceededError } from '../../src/lib/errors.js';

const config = { token: 'test-github-token' };

const mockPR = {
  number: 1,
  title: 'Test PR',
  html_url: 'https://github.com/owner/repo/pull/1',
  head: { ref: 'feature-branch' },
  base: { ref: 'main' },
  state: 'open',
  body: 'Test PR body',
};

describe('GitHub Client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('createPR succeeds with 201 response', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(mockPR), { status: 201 }));

    const client = createGitHubClient(config);
    const result = await client.createPR({
      owner: 'owner',
      repo: 'repo',
      title: 'Test PR',
      head: 'feature-branch',
      base: 'main',
      body: 'Test PR body',
    });

    expect(result).toEqual(mockPR);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('listPRs succeeds with 200 response array', async () => {
    const mockPRArray = [mockPR, { ...mockPR, number: 2, title: 'Test PR 2' }];
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(mockPRArray), { status: 200 }));

    const client = createGitHubClient(config);
    const result = await client.listPRs({
      owner: 'owner',
      repo: 'repo',
      state: 'open',
    });

    expect(result).toEqual(mockPRArray);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('getPR succeeds with 200 response', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(mockPR), { status: 200 }));

    const client = createGitHubClient(config);
    const result = await client.getPR({
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1,
    });

    expect(result).toEqual(mockPR);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends Bearer auth header with token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(mockPR), { status: 200 }));

    const client = createGitHubClient(config);
    await client.getPR({
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1,
    });

    const call = fetchSpy.mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-github-token');
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mockPR), { status: 200 }));

    const client = createGitHubClient(config);
    const promise = client.getPR({
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1,
    });

    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result).toEqual(mockPR);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries on 403 with X-RateLimit-Remaining: 0 header', async () => {
    const rateLimitResponse = new Response('', {
      status: 403,
      headers: {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
      },
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify(mockPR), { status: 200 }));

    const client = createGitHubClient(config);
    const promise = client.getPR({
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1,
    });

    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result).toEqual(mockPR);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws ExternalApiError on 403 without X-RateLimit-Remaining header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 403 }));

    const client = createGitHubClient(config);

    await expect(
      client.getPR({
        owner: 'owner',
        repo: 'repo',
        pullNumber: 1,
      }),
    ).rejects.toThrow(ExternalApiError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws RateLimitExceededError after exhausting all retry attempts on 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));

    const client = createGitHubClient(config);
    const promise = client.getPR({
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1,
    });

    const assertionBeforeTimers = expect(promise).rejects.toThrow(RateLimitExceededError);
    await vi.advanceTimersByTimeAsync(3500);
    await assertionBeforeTimers;
  });

  it('includes retryAfterMs from X-RateLimit-Reset header in error', async () => {
    const resetEpochSeconds = Math.floor(Date.now() / 1000) + 60;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 429,
        headers: {
          'X-RateLimit-Reset': String(resetEpochSeconds),
        },
      }),
    );

    const client = createGitHubClient(config);
    const promise = client.getPR({
      owner: 'owner',
      repo: 'repo',
      pullNumber: 1,
    });

    const rejectionBeforeTimers = expect(promise).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(RateLimitExceededError);
      const rateLimitError = error as RateLimitExceededError;
      expect(rateLimitError.retryAfterMs).toBeDefined();
      expect(typeof rateLimitError.retryAfterMs).toBe('number');
      expect(rateLimitError.retryAfterMs).toBeGreaterThan(0);
      return true;
    });
    await vi.advanceTimersByTimeAsync(3500);
    await rejectionBeforeTimers;
  });

  it('throws ExternalApiError on 404 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));

    const client = createGitHubClient(config);

    await expect(
      client.getPR({
        owner: 'owner',
        repo: 'repo',
        pullNumber: 999,
      }),
    ).rejects.toThrow(ExternalApiError);
  });

  it('throws ExternalApiError on 422 response without retry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 422 }));

    const client = createGitHubClient(config);

    await expect(
      client.createPR({
        owner: 'owner',
        repo: 'repo',
        title: 'Invalid PR',
        head: 'feature-branch',
        base: 'main',
      }),
    ).rejects.toThrow(ExternalApiError);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
