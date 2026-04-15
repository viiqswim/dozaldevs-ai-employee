import { WebClient } from '@slack/web-api';
import type { ToolDefinition, ToolContext } from './types.js';

interface SlackPostMessageParams {
  channel: string;
  summary_text: string;
  stats?: {
    messages: number;
    threads: number;
    participants: number;
  };
  task_id: string;
}

interface SlackPostMessageResult {
  ts: string;
  channel: string;
}

export const slackPostMessageTool: ToolDefinition<SlackPostMessageParams, SlackPostMessageResult> =
  {
    name: 'slack.postMessage',
    async execute(params, ctx: ToolContext): Promise<SlackPostMessageResult> {
      const token = ctx.env['SLACK_BOT_TOKEN'];
      if (!token) throw new Error('SLACK_BOT_TOKEN is not set in environment');

      const client = new WebClient(token);
      const date = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      const blocks = [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📰 Daily Summary — ${date}`, emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: params.summary_text },
        },
        { type: 'divider' },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${params.stats?.messages ?? 0} messages · ${params.stats?.threads ?? 0} threads · ${params.stats?.participants ?? 0} participants`,
            },
          ],
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Approve & Post', emoji: true },
              action_id: 'approve',
              value: params.task_id,
              style: 'primary',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ Reject', emoji: true },
              action_id: 'reject',
              value: params.task_id,
              style: 'danger',
            },
          ],
        },
      ];

      const result = await client.chat.postMessage({
        channel: params.channel,
        text: '📰 Daily Summary pending approval',
        blocks,
      });

      if (!result.ok || !result.ts || !result.channel) {
        throw new Error(`Slack postMessage failed: ${result.error ?? 'unknown error'}`);
      }

      return { ts: result.ts, channel: result.channel };
    },
  };
