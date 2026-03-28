import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSlackClient } from '../../src/lib/slack-client.js';
import { ExternalApiError, RateLimitExceededError } from '../../src/lib/errors.js';

const config = {
  botToken: 'xoxb-test-token',
  defaultChannel: 'C0123456789',
};

const makeSlackSuccessResponse = (ts = '1234567890.000001', channel = 'C0123456789') =>
  new Response(JSON.stringify({ ok: true, ts, channel }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Slack Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('postMessage succeeds with valid response', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeSlackSuccessResponse());

    const client = createSlackClient(config);
    const result = await client.postMessage({
      text: 'Hello, Slack!',
    });

    expect(result).toEqual({
      ts: '1234567890.000001',
      channel: 'C0123456789',
    });
  });

  it('includes Bearer auth header with bot token', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeSlackSuccessResponse());

    const client = createSlackClient(config);
    await client.postMessage({
      text: 'Hello, Slack!',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://slack.com/api/chat.postMessage',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer xoxb-test-token',
        }),
      }),
    );
  });

  it('uses defaultChannel when no channel specified in params', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeSlackSuccessResponse());

    const client = createSlackClient(config);
    await client.postMessage({
      text: 'Hello, Slack!',
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.channel).toBe('C0123456789');
  });

  it('retries on 429 rate limit and succeeds on second attempt', async () => {
    vi.useFakeTimers();

    const rateLimitResponse = new Response(JSON.stringify({}), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(makeSlackSuccessResponse());

    const client = createSlackClient(config);
    const resultPromise = client.postMessage({
      text: 'Hello, Slack!',
    });

    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;

    expect(result).toEqual({
      ts: '1234567890.000001',
      channel: 'C0123456789',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('RateLimitExceededError includes retryAfterMs from Retry-After header', async () => {
    const rateLimitResponse = new Response(JSON.stringify({}), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '30',
      },
    });

    global.fetch = vi.fn().mockResolvedValue(rateLimitResponse);

    const client = createSlackClient(config);

    try {
      await client.postMessage({
        text: 'Hello, Slack!',
      });
      expect.fail('Should have thrown RateLimitExceededError');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError);
      expect((err as RateLimitExceededError).retryAfterMs).toBe(30000);
    }
  });

  it('throws ExternalApiError when ok is false', async () => {
    const errorResponse = new Response(
      JSON.stringify({
        ok: false,
        error: 'channel_not_found',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    global.fetch = vi.fn().mockResolvedValue(errorResponse);

    const client = createSlackClient(config);

    try {
      await client.postMessage({
        text: 'Hello, Slack!',
      });
      expect.fail('Should have thrown ExternalApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ExternalApiError);
      expect((err as ExternalApiError).service).toBe('slack');
      expect((err as ExternalApiError).statusCode).toBe(200);
    }
  });

  it('throws ExternalApiError on non-200 HTTP status', async () => {
    const errorResponse = new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });

    global.fetch = vi.fn().mockResolvedValue(errorResponse);

    const client = createSlackClient(config);

    try {
      await client.postMessage({
        text: 'Hello, Slack!',
      });
      expect.fail('Should have thrown ExternalApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ExternalApiError);
      expect((err as ExternalApiError).service).toBe('slack');
    }
  });

  it('includes blocks in request body when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeSlackSuccessResponse());

    const client = createSlackClient(config);
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: '*Bold*' } }];

    await client.postMessage({
      text: 'Hello, Slack!',
      blocks,
    });

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.blocks).toEqual(blocks);
  });
});
