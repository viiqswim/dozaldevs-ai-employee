import { WebClient } from '@slack/web-api';

import { requireEnv } from '../lib/require-env.js';
import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  id: 'read-channels',
  service: 'slack',
  description: 'Read messages from one or more Slack channels within a lookback window',
  envVars: ['SLACK_BOT_TOKEN'],
  args: [
    {
      name: '--channels',
      required: true,
      description:
        'Comma-separated Slack channel IDs or names (e.g. "C123,general,#ops"). Names are resolved to IDs via conversations.list.',
      type: 'string',
    },
    {
      name: '--lookback-hours',
      required: false,
      description: 'Hours to look back (default: 24)',
      type: 'number',
    },
  ],
};

const CHANNEL_ID_PATTERN = /^[CGD][A-Z0-9]+$/;

export function isChannelId(entry: string): boolean {
  return CHANNEL_ID_PATTERN.test(entry);
}

export async function resolveChannelNames(client: WebClient, entries: string[]): Promise<string[]> {
  const hasNames = entries.some((e) => !isChannelId(e));

  const nameToId = new Map<string, string>();

  if (hasNames) {
    const listResponse = await client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000,
    });
    const channelList = listResponse.channels ?? [];
    for (const ch of channelList) {
      if (ch.name && ch.id) {
        nameToId.set(ch.name.toLowerCase(), ch.id);
      }
    }
  }

  const resolved: string[] = [];
  for (const entry of entries) {
    if (isChannelId(entry)) {
      resolved.push(entry);
    } else {
      const normalized = entry.startsWith('#') ? entry.slice(1) : entry;
      const channelId = nameToId.get(normalized.toLowerCase());
      if (channelId) {
        resolved.push(channelId);
      } else {
        process.stderr.write(`Warning: channel name "${entry}" not found in workspace, skipping\n`);
      }
    }
  }

  return resolved;
}

interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  reply_count?: number;
  thread_ts?: string;
}

interface ChannelResult {
  channelId: string;
  messages: SlackMessage[];
  threadReplies: Record<string, SlackMessage[]>;
}

function parseArgs(argv: string[]): { channelEntries: string[]; lookbackHours: number } {
  const args = argv.slice(2);
  let channelsRaw = '';
  let lookbackHours = 24;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channels' && args[i + 1]) {
      channelsRaw = args[++i];
    } else if (args[i] === '--lookback-hours' && args[i + 1]) {
      lookbackHours = parseInt(args[++i], 10);
    } else if (args[i] === '--help') {
      process.stdout.write(
        'Usage: read-channels.js --channels "C123,general,#ops" [--lookback-hours 24]\n',
      );
      process.exit(0);
    }
  }

  const channelEntries = channelsRaw
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  return { channelEntries, lookbackHours };
}

function truncateText(text: string | undefined): string | undefined {
  if (text !== undefined && text.length > 500) {
    return text.slice(0, 497) + '...';
  }
  return text;
}

function isSummaryPost(raw: unknown): boolean {
  const blocks = (raw as Record<string, unknown>)['blocks'];
  if (!Array.isArray(blocks)) return false;
  return blocks.some(
    (b: unknown) => (b as Record<string, unknown>)['block_id'] === 'papi-chulo-daily-summary',
  );
}

async function fetchChannel(
  client: WebClient,
  channelId: string,
  oldest: string,
): Promise<ChannelResult> {
  const rawMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.conversations.history({
      channel: channelId,
      oldest,
      limit: 200,
      cursor,
    });

    for (const msg of response.messages ?? []) {
      if (msg.subtype !== undefined) continue;
      if (isSummaryPost(msg)) continue;
      rawMessages.push({
        ts: msg.ts ?? '',
        user: msg.user,
        text: truncateText(msg.text),
        reply_count: msg.reply_count,
        thread_ts: msg.thread_ts,
      });
    }

    cursor = response.response_metadata?.next_cursor;
  } while (cursor);

  const messages = [...rawMessages].reverse();
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

        for (const reply of (repliesResponse.messages ?? []).slice(1)) {
          if ((reply as Record<string, unknown>)['subtype'] !== undefined) continue;
          replies.push({
            ts: reply.ts ?? '',
            user: reply.user,
            text: truncateText(reply.text),
            reply_count: reply.reply_count,
            thread_ts: reply.thread_ts,
          });
        }

        repliesCursor = repliesResponse.response_metadata?.next_cursor;
      } while (repliesCursor);

      threadReplies[msg.ts] = replies;
    }
  }

  return { channelId, messages, threadReplies };
}

async function main(): Promise<void> {
  const { channelEntries, lookbackHours } = parseArgs(process.argv);

  const token = requireEnv('SLACK_BOT_TOKEN');

  if (channelEntries.length === 0) {
    process.stderr.write('Error: --channels argument is required\n');
    process.exit(1);
  }

  const client = new WebClient(token);
  const resolvedChannelIds = await resolveChannelNames(client, channelEntries);
  const oldest = String(Math.floor(Date.now() / 1000) - lookbackHours * 3600);
  const results: ChannelResult[] = [];

  for (const channelId of resolvedChannelIds) {
    try {
      const result = await fetchChannel(client, channelId, oldest);
      results.push(result);
    } catch (err) {
      process.stderr.write(`Warning: failed to fetch channel ${channelId}: ${String(err)}\n`);
      results.push({ channelId, messages: [], threadReplies: {} });
    }
  }

  process.stdout.write(JSON.stringify({ channels: results }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
