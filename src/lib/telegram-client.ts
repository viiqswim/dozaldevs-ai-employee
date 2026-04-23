/** Telegram Bot API client — plain text push notifications. */
import { ExternalApiError, RateLimitExceededError } from './errors.js';
import { withRetry } from './retry.js';

export interface TelegramClientConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramClient {
  sendMessage(text: string): Promise<void>;
}

export function createTelegramClient(config: TelegramClientConfig): TelegramClient {
  return {
    async sendMessage(text: string): Promise<void> {
      return withRetry(
        async () => {
          const response = await fetch(
            `https://api.telegram.org/bot${config.botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: config.chatId, text }),
            },
          );

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
            const retryAfterMs = retryAfterSeconds ? retryAfterSeconds * 1000 : undefined;

            throw new RateLimitExceededError(
              `Telegram rate limit exceeded: ${response.statusText}`,
              {
                service: 'telegram',
                attempts: 1,
                retryAfterMs,
              },
            );
          }

          const data = (await response.json()) as {
            ok: boolean;
            description?: string;
          };

          if (!data.ok) {
            throw new ExternalApiError(
              `Telegram API error: ${data.description || 'unknown error'}`,
              {
                service: 'telegram',
                statusCode: 200,
                endpoint: '/bot/sendMessage',
              },
            );
          }

          if (response.status !== 200) {
            throw new ExternalApiError(`Telegram API error: ${response.statusText}`, {
              service: 'telegram',
              statusCode: response.status,
              endpoint: '/bot/sendMessage',
            });
          }
        },
        {
          maxAttempts: 2,
          baseDelayMs: 1000,
          retryOn: (err) => err instanceof RateLimitExceededError,
        },
      );
    },
  };
}

export async function sendTelegramNotification(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn(
      '[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification',
    );
    return;
  }

  await createTelegramClient({ botToken, chatId }).sendMessage(text);
}
