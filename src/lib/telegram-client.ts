/** Telegram Bot API client — plain text push notifications. */
import { ExternalApiError } from './errors.js';
import { createHttpClient } from './http-client.js';
import { createLogger } from './logger.js';

const logger = createLogger('telegram-client');

export interface TelegramClientConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramClient {
  sendMessage(text: string): Promise<void>;
}

export function createTelegramClient(config: TelegramClientConfig): TelegramClient {
  const http = createHttpClient(
    'https://api.telegram.org',
    { 'Content-Type': 'application/json' },
    { service: 'telegram', maxAttempts: 2, baseDelayMs: 1000 },
  );

  return {
    async sendMessage(text: string): Promise<void> {
      const response = await http.post(`/bot${config.botToken}/sendMessage`, {
        chat_id: config.chatId,
        text,
      });

      const data = (await response.json()) as {
        ok: boolean;
        description?: string;
      };

      if (!data.ok) {
        throw new ExternalApiError(`Telegram API error: ${data.description || 'unknown error'}`, {
          service: 'telegram',
          statusCode: 200,
          endpoint: '/bot/sendMessage',
        });
      }

      if (response.status !== 200) {
        throw new ExternalApiError(`Telegram API error: ${response.statusText}`, {
          service: 'telegram',
          statusCode: response.status,
          endpoint: '/bot/sendMessage',
        });
      }
    },
  };
}

export async function sendTelegramNotification(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification');
    return;
  }

  await createTelegramClient({ botToken, chatId }).sendMessage(text);
}
