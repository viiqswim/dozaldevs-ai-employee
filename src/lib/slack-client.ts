/**
 * Slack Web API client — postMessage only.
 * IMPORTANT: Slack returns HTTP 200 even for errors. Always check response.ok field.
 */
import { ExternalApiError, RateLimitExceededError } from './errors.js';
import { withRetry } from './retry.js';

export interface SlackClientConfig {
  botToken: string;
  defaultChannel: string;
}

export interface SlackMessageParams {
  text: string;
  channel?: string; // optional — uses defaultChannel if not specified
  blocks?: unknown[]; // optional rich blocks
}

export interface SlackMessageResult {
  ts: string; // message timestamp
  channel: string; // channel ID where message was posted
}

export interface SlackClient {
  postMessage(params: SlackMessageParams): Promise<SlackMessageResult>;
}

/**
 * Create a Slack Web API client.
 */
export function createSlackClient(config: SlackClientConfig): SlackClient {
  return {
    async postMessage(params: SlackMessageParams): Promise<SlackMessageResult> {
      return withRetry(
        async () => {
          const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              channel: params.channel ?? config.defaultChannel,
              text: params.text,
              ...(params.blocks ? { blocks: params.blocks } : {}),
            }),
          });

          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
            const retryAfterMs = retryAfterSeconds ? retryAfterSeconds * 1000 : undefined;

            throw new RateLimitExceededError(`Slack rate limit exceeded: ${response.statusText}`, {
              service: 'slack',
              attempts: 1,
              retryAfterMs,
            });
          }

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

          return {
            ts: data.ts!,
            channel: data.channel!,
          };
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          retryOn: (err) => err instanceof RateLimitExceededError,
        },
      );
    },
  };
}
