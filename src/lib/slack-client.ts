/**
 * Slack Web API client — postMessage and updateMessage.
 * IMPORTANT: Slack returns HTTP 200 even for errors. Always check response.ok field.
 */
import { ExternalApiError } from './errors.js';
import { createHttpClient } from './http-client.js';

export interface SlackClientConfig {
  botToken: string;
  defaultChannel: string;
}

interface SlackMessageParams {
  text: string;
  channel?: string; // optional — uses defaultChannel if not specified
  blocks?: unknown[]; // optional rich blocks
  thread_ts?: string; // optional — reply in thread if provided
  unfurl_links?: boolean; // optional — suppress URL previews when false
}

interface SlackMessageResult {
  ts: string; // message timestamp
  channel: string; // channel ID where message was posted
}

export interface SlackClient {
  postMessage(params: SlackMessageParams): Promise<SlackMessageResult>;
  updateMessage(channel: string, ts: string, text: string, blocks?: unknown[]): Promise<void>;
}

export function createSlackClient(config: SlackClientConfig): SlackClient {
  const http = createHttpClient(
    'https://slack.com',
    {
      Authorization: `Bearer ${config.botToken}`,
      'Content-Type': 'application/json',
    },
    { service: 'slack', maxAttempts: 3, baseDelayMs: 1000 },
  );

  return {
    async postMessage(params: SlackMessageParams): Promise<SlackMessageResult> {
      const response = await http.post('/api/chat.postMessage', {
        channel: params.channel ?? config.defaultChannel,
        text: params.text,
        ...(params.blocks ? { blocks: params.blocks } : {}),
        ...(params.thread_ts ? { thread_ts: params.thread_ts } : {}),
        ...(params.unfurl_links !== undefined ? { unfurl_links: params.unfurl_links } : {}),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        ts?: string;
        channel?: string;
      };

      if (!data.ok) {
        throw new ExternalApiError(`Slack API error: ${data.error || 'unknown error'}`, {
          service: 'slack',
          statusCode: 200,
          endpoint: '/api/chat.postMessage',
        });
      }

      return { ts: data.ts!, channel: data.channel! };
    },

    async updateMessage(
      channel: string,
      ts: string,
      text: string,
      blocks?: unknown[],
    ): Promise<void> {
      const body: Record<string, unknown> = { channel, ts, text };
      if (blocks) body.blocks = blocks;

      const response = await http.post('/api/chat.update', body);

      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        throw new ExternalApiError(`Slack API error: ${data.error ?? 'unknown error'}`, {
          service: 'slack',
          statusCode: 200,
          endpoint: '/api/chat.update',
        });
      }
    },
  };
}
