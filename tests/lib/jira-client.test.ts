import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJiraClient } from '../../src/lib/jira-client.js';
import { ExternalApiError, RateLimitExceededError } from '../../src/lib/errors.js';

const config = {
  baseUrl: 'https://test.atlassian.net',
  email: 'test@example.com',
  apiToken: 'test-token',
};

function makeFetchResponse(body: object | undefined, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText:
      status === 200
        ? 'OK'
        : status === 201
          ? 'Created'
          : status === 204
            ? 'No Content'
            : status === 404
              ? 'Not Found'
              : status === 429
                ? 'Too Many Requests'
                : 'Internal Server Error',
    headers: new Map([['Content-Type', 'application/json']]),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('jira-client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('getIssue succeeds and returns issue data with id, key, and fields.summary', async () => {
    const mockIssue = {
      id: '10000',
      key: 'PROJ-123',
      fields: {
        summary: 'Test issue',
        description: 'A test issue',
        status: { name: 'Open' },
        assignee: { displayName: 'John Doe' },
        priority: { name: 'High' },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(mockIssue, 200));

    const client = createJiraClient(config);
    const result = await client.getIssue('PROJ-123');

    expect(result.id).toBe('10000');
    expect(result.key).toBe('PROJ-123');
    expect(result.fields.summary).toBe('Test issue');
  });

  it('addComment succeeds and resolves without error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(undefined, 201));

    const client = createJiraClient(config);
    await expect(client.addComment('PROJ-123', 'Test comment')).resolves.toBeUndefined();
  });

  it('transitionIssue succeeds and resolves without error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(undefined, 204));

    const client = createJiraClient(config);
    await expect(client.transitionIssue('PROJ-123', '11')).resolves.toBeUndefined();
  });

  it('includes Basic auth header with base64 encoded email:token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        makeFetchResponse({ id: '10000', key: 'PROJ-123', fields: { summary: 'Test' } }, 200),
      );

    const client = createJiraClient(config);
    await client.getIssue('PROJ-123');

    const expectedAuth = `Basic ${btoa('test@example.com:test-token')}`;
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe(expectedAuth);
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    const mockIssue = {
      id: '10000',
      key: 'PROJ-123',
      fields: { summary: 'Test issue' },
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeFetchResponse(undefined, 429))
      .mockResolvedValueOnce(makeFetchResponse(mockIssue, 200));

    const client = createJiraClient(config);
    const promise = client.getIssue('PROJ-123');

    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result.id).toBe('10000');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws RateLimitExceededError after exhausting all retry attempts on 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeFetchResponse(undefined, 429));

    const client = createJiraClient(config);

    const promise = expect(client.getIssue('PROJ-123')).rejects.toThrow(RateLimitExceededError);
    await vi.advanceTimersByTimeAsync(7500);
    await promise;
  });

  it('throws ExternalApiError on 404 response without retry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(undefined, 404));

    const client = createJiraClient(config);

    await expect(client.getIssue('PROJ-999')).rejects.toThrow(ExternalApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws ExternalApiError on 500 response without retry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(undefined, 500));

    const client = createJiraClient(config);

    await expect(client.getIssue('PROJ-123')).rejects.toThrow(ExternalApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('constructs correct URL for getIssue endpoint', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        makeFetchResponse({ id: '10000', key: 'PROJ-123', fields: { summary: 'Test' } }, 200),
      );

    const client = createJiraClient(config);
    await client.getIssue('PROJ-123');

    const url = fetchSpy.mock.calls[0][0];
    expect(url).toBe('https://test.atlassian.net/rest/api/3/issue/PROJ-123');
  });

  it('constructs correct URL and body for addComment endpoint', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeFetchResponse(undefined, 201));

    const client = createJiraClient(config);
    await client.addComment('PROJ-123', 'Test comment');

    const url = fetchSpy.mock.calls[0][0];
    expect(url).toBe('https://test.atlassian.net/rest/api/3/issue/PROJ-123/comment');

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.body.type).toBe('doc');
    expect(body.body.content[0].type).toBe('paragraph');
    expect(body.body.content[0].content[0].text).toBe('Test comment');
  });
});
