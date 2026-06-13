import fs from 'fs';

import { WebClient } from '@slack/web-api';

import { getArg } from '../lib/get-arg.js';
import { optionalEnv, requireEnv } from '../lib/require-env.js';
import { unescapeShellArg } from '../lib/unescape-args.js';
import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  id: 'post-message',
  service: 'slack',
  description: 'Post a message to a Slack channel with optional Block Kit blocks',
  envVars: ['SLACK_BOT_TOKEN'],
  args: [
    {
      name: '--channel',
      required: true,
      description: 'Slack channel ID to post to',
      type: 'string',
    },
    {
      name: '--text',
      required: false,
      description: 'Message text (markdown auto-converted to Slack mrkdwn)',
      type: 'string',
    },
    {
      name: '--text-file',
      required: false,
      description: 'Read message text from file at path',
      type: 'string',
    },
    {
      name: '--blocks',
      required: false,
      description: 'Optional Block Kit blocks JSON array',
      type: 'string',
    },
    {
      name: '--task-id',
      required: false,
      description: 'Task ID — auto-generates context block',
      type: 'string',
    },
    {
      name: '--conversation-ref',
      required: false,
      description: 'Hostfully thread UID for superseding detection',
      type: 'string',
    },
    { name: '--title', required: false, description: 'Approval card header title', type: 'string' },
    {
      name: '--thread-ts',
      required: false,
      description: 'Slack message timestamp to reply in thread',
      type: 'string',
    },
  ],
};

interface PostResult {
  ts: string;
  channel: string;
  conversationRef?: string;
}

/** **bold** → *bold*  ·  ~~strike~~ → ~strike~ */
function markdownToMrkdwn(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/gs, '*$1*').replace(/~~(.+?)~~/gs, '~$1~');
}

export function buildApprovalBlocks(
  text: string,
  taskId: string,
  date: string,
  title?: string,
  runId?: string,
): unknown[] {
  return [
    {
      type: 'header',
      block_id: 'papi-chulo-daily-summary',
      text: { type: 'plain_text', text: title ?? `Task Review — ${date}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text },
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Task \`${taskId}\`` },
        ...(runId ? [{ type: 'mrkdwn', text: `Run \`${runId}\`` }] : []),
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve & Post', emoji: true },
          action_id: 'approve',
          value: taskId,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject', emoji: true },
          action_id: 'reject',
          value: taskId,
          style: 'danger',
        },
      ],
    },
  ];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: post-message.js --channel "C123" --text "Hello" [--blocks \'[...]\'] [--task-id "uuid"] [--conversation-ref <string>] [--title <string>] [--thread-ts <ts>]\n\n' +
        'Options:\n' +
        '  --channel <id>              (required) Slack channel ID to post to\n' +
        '  --text <string>             (required) Message text (markdown **bold** auto-converted to Slack *bold*)\n' +
        '  --text-file <path>          Read message text from file at <path> (avoids shell quoting issues)\n' +
        '  --blocks <json>             Optional Block Kit blocks JSON array\n' +
        '  --task-id <uuid>            Optional task ID — auto-generates context block; falls back to $TASK_ID env var\n' +
        '  --conversation-ref <string> Optional Hostfully thread UID to track conversation for superseding detection\n' +
        '  --title <string>            Optional approval card header title (default: "Task Review — <date>")\n' +
        '  --thread-ts <ts>            Optional Slack message timestamp to reply in thread\n' +
        '  --no-thread                 Deprecated no-op. NOTIFY_MSG_TS always threads task messages together.\n' +
        '  --help                      Show this help message\n',
    );
    process.exit(0);
  }

  const channel = getArg(args, '--channel') ?? '';
  const rawText = getArg(args, '--text');
  const rawBlocks = getArg(args, '--blocks');
  const taskId = getArg(args, '--task-id');
  const conversationRef = getArg(args, '--conversation-ref');
  const title = getArg(args, '--title');
  const textFile = getArg(args, '--text-file');
  const threadTs = getArg(args, '--thread-ts') ?? optionalEnv('NOTIFY_MSG_TS');

  let text = rawText ? unescapeShellArg(rawText) : '';
  const parsedBlocks: unknown[] | undefined = rawBlocks
    ? (JSON.parse(rawBlocks) as unknown[])
    : undefined;

  if (textFile && !text) {
    if (!fs.existsSync(textFile)) {
      process.stderr.write(`Error: --text-file path does not exist: ${textFile}\n`);
      process.exit(1);
    }
    text = fs.readFileSync(textFile, 'utf8').trim();
  }

  text = markdownToMrkdwn(text);

  const runId = optionalEnv('INNGEST_RUN_ID');

  const token = requireEnv('SLACK_BOT_TOKEN');

  if (!channel) {
    process.stderr.write('Error: --channel argument is required\n');
    process.exit(1);
  }

  if (!text) {
    process.stderr.write('Error: --text argument is required\n');
    process.exit(1);
  }

  const client = new WebClient(token);

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const effectiveTaskId = taskId ?? optionalEnv('TASK_ID');
  const isDeliveryPhase = optionalEnv('EMPLOYEE_PHASE') === 'delivery';

  const blocks =
    parsedBlocks ??
    (effectiveTaskId
      ? isDeliveryPhase || optionalEnv('APPROVAL_REQUIRED') === 'false'
        ? [
            { type: 'section', text: { type: 'mrkdwn', text } },
            { type: 'divider' },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `Task \`${effectiveTaskId}\`` },
                ...(runId ? [{ type: 'mrkdwn', text: `Run \`${runId}\`` }] : []),
              ],
            },
          ]
        : buildApprovalBlocks(text, effectiveTaskId, date, title, runId)
      : undefined);

  const result = await client.chat.postMessage({
    channel,
    text,
    ...(blocks !== undefined && { blocks: blocks as import('@slack/web-api').KnownBlock[] }),
    ...(threadTs !== undefined && { thread_ts: threadTs }),
  });

  if (!result.ok || !result.ts || !result.channel) {
    process.stderr.write(`Error: Slack postMessage failed: ${result.error ?? 'unknown'}\n`);
    process.exit(1);
  }

  const output: PostResult = {
    ts: result.ts,
    channel: result.channel,
    ...(conversationRef !== undefined && { conversationRef }),
  };
  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
