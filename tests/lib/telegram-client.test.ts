import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTelegramClient, sendTelegramNotification } from '../../src/lib/telegram-client.js';
import { ExternalApiError, RateLimitExceededError } from '../../src/lib/errors.js';

const config = {
  botToken: 'test-bot-token',
  chatId: '123456789',
};

const makeTelegramSuccessResponse = () =>
  new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Telegram Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('sendMessage succeeds with valid response', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeTelegramSuccessResponse());

    const promise = createTelegramClient(config).sendMessage('Hello, Telegram!');

    await expect(promise).resolves.toBeUndefined();
  });

  it('sends correct request to Telegram API', async () => {
    global.fetch = vi.fn().mockResolvedValue(makeTelegramSuccessResponse());

    await createTelegramClient(config).sendMessage('Hello, Telegram!');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-bot-token/sendMessage',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );

    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body).toMatchObject({ chat_id: '123456789', text: 'Hello, Telegram!' });
  });

  it('throws ExternalApiError when ok is false', async () => {
    const errorResponse = new Response(
      JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    global.fetch = vi.fn().mockResolvedValue(errorResponse);

    try {
      await createTelegramClient(config).sendMessage('Hello');
      expect.fail('Should have thrown ExternalApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ExternalApiError);
      expect((err as ExternalApiError).service).toBe('telegram');
      expect((err as ExternalApiError).statusCode).toBe(200);
    }
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
      .mockResolvedValueOnce(makeTelegramSuccessResponse());

    const resultPromise = createTelegramClient(config).sendMessage('Hello, Telegram!');

    await vi.advanceTimersByTimeAsync(2000);

    await expect(resultPromise).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('RateLimitExceededError thrown after all retries exhausted', async () => {
    vi.useFakeTimers();

    const rateLimitResponse = new Response(JSON.stringify({}), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

    global.fetch = vi.fn().mockResolvedValue(rateLimitResponse);

    const resultPromise = createTelegramClient(config).sendMessage('Hello');
    resultPromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(2000);

    try {
      await resultPromise;
      expect.fail('Should have thrown RateLimitExceededError');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError);
    }
    expect(global.fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('sendTelegramNotification is a silent no-op when env vars missing', async () => {
    const savedBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const savedChatId = process.env.TELEGRAM_CHAT_ID;

    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    global.fetch = vi.fn();

    try {
      await expect(sendTelegramNotification('should be silent')).resolves.toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      if (savedBotToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = savedBotToken;
      if (savedChatId !== undefined) process.env.TELEGRAM_CHAT_ID = savedChatId;
    }
  });
});
