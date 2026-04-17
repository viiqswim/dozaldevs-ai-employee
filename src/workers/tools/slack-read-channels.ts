import { WebClient } from '@slack/web-api';
import type { ToolDefinition, ToolContext } from './types.js';

export type SlackMessage = {
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  reply_count?: number;
  thread_ts?: string;
  isSummaryPost?: boolean;
};

export interface ChannelActivity {
  messages: SlackMessage[];
  threadReplies: Record<string, SlackMessage[]>;
  totalMessages: number;
  fetchedAt: number;
}

export class ChannelFetchError extends Error {
  constructor(
    public readonly code: string,
    public readonly channelId: string,
  ) {
    super(`Channel ${channelId}: ${code}`);
    this.name = 'ChannelFetchError';
  }
}

const FATAL_CODES = new Set(['not_in_channel', 'channel_not_found', 'is_archived']);

function truncateText(text: string | undefined): string | undefined {
  if (text !== undefined && text.length > 500) {
    return text.slice(0, 497) + '...';
  }
  return text;
}

function extractSubtype(raw: unknown): string | undefined {
  return (raw as Record<string, unknown>)['subtype'] as string | undefined;
}

function isSummaryPost(raw: unknown): boolean {
  const blocks = (raw as Record<string, unknown>)['blocks'];
  if (!Array.isArray(blocks)) return false;
  return blocks.some(
    (b: unknown) => (b as Record<string, unknown>)['block_id'] === 'papi-chulo-daily-summary',
  );
}

async function fetchChannelActivity(
  client: WebClient,
  channelId: string,
  options?: { oldest?: string; latest?: string },
): Promise<ChannelActivity> {
  const oldest = options?.oldest ?? String(Math.floor(Date.now() / 1000) - 86400);
  const rawMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    let response;
    try {
      response = await client.conversations.history({
        channel: channelId,
        oldest,
        ...(options?.latest !== undefined ? { latest: options.latest } : {}),
        limit: 200,
        cursor,
      });
    } catch (err) {
      if (err instanceof ChannelFetchError) throw err;
      const slackCode = (err as { data?: { error?: string } }).data?.error;
      if (slackCode !== undefined && FATAL_CODES.has(slackCode)) {
        throw new ChannelFetchError(slackCode, channelId);
      }
      throw err;
    }

    if (response.error) {
      if (FATAL_CODES.has(response.error)) throw new ChannelFetchError(response.error, channelId);
      throw new Error(`Slack API error: ${response.error}`);
    }

    for (const msg of response.messages ?? []) {
      rawMessages.push({
        ts: msg.ts ?? '',
        user: msg.user,
        text: truncateText(msg.text),
        subtype: msg.subtype,
        reply_count: msg.reply_count,
        thread_ts: msg.thread_ts,
        isSummaryPost: isSummaryPost(msg),
      });
    }

    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  const userMessages = rawMessages.filter((msg) => msg.subtype === undefined && !msg.isSummaryPost);
  const messages = [...userMessages].reverse();

  const threadReplies: Record<string, SlackMessage[]> = {};

  for (const msg of messages) {
    if ((msg.reply_count ?? 0) > 0 && msg.thread_ts === msg.ts) {
      const replies: SlackMessage[] = [];
      let repliesCursor: string | undefined;

      do {
        const repliesResponse = await client.conversations.replies({
          channel: channelId,
          ts: msg.ts,
          limit: 200,
          cursor: repliesCursor,
        });

        const repliesWithoutParent = (repliesResponse.messages ?? []).slice(1);
        for (const reply of repliesWithoutParent) {
          const replySubtype = extractSubtype(reply);
          if (replySubtype !== undefined) continue;
          replies.push({
            ts: reply.ts ?? '',
            user: reply.user,
            text: truncateText(reply.text),
            subtype: replySubtype,
            reply_count: reply.reply_count,
            thread_ts: reply.thread_ts,
          });
        }

        repliesCursor = repliesResponse.response_metadata?.next_cursor;
      } while (repliesCursor);

      threadReplies[msg.ts] = replies;
    }
  }

  return {
    messages,
    threadReplies,
    totalMessages: messages.length,
    fetchedAt: Date.now(),
  };
}

interface SlackReadChannelsParams {
  channels: string;
  lookback_hours: number;
}

interface SlackReadChannelsResult {
  channels: Array<{
    channelId: string;
    messages: SlackMessage[];
    threadReplies: Record<string, SlackMessage[]>;
  }>;
}

export const slackReadChannelsTool: ToolDefinition<
  SlackReadChannelsParams,
  SlackReadChannelsResult
> = {
  name: 'slack.readChannels',
  async execute(params, ctx: ToolContext): Promise<SlackReadChannelsResult> {
    const { channels, lookback_hours } = params;
    const token = ctx.env['SLACK_BOT_TOKEN'];
    if (!token) {
      throw new Error('SLACK_BOT_TOKEN is not set in environment');
    }

    const client = new WebClient(token);
    const oldest = String(Math.floor(Date.now() / 1000) - lookback_hours * 3600);

    const channelIds = channels
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    const results: SlackReadChannelsResult['channels'] = [];

    for (const channelId of channelIds) {
      try {
        const activity = await fetchChannelActivity(client, channelId, { oldest });
        results.push({
          channelId,
          messages: activity.messages.map(({ isSummaryPost: _, ...msg }) => msg),
          threadReplies: activity.threadReplies,
        });
      } catch (err) {
        if (err instanceof ChannelFetchError) {
          ctx.logger.warn({ channelId, code: err.code }, `Skipping channel: ${err.message}`);
          results.push({
            channelId,
            messages: [],
            threadReplies: {},
          });
        } else {
          throw err;
        }
      }
    }

    return { channels: results };
  },
};
