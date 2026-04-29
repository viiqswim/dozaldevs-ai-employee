import { WebClient } from '@slack/web-api';

interface PostResult {
  ts: string;
  channel: string;
  conversationRef?: string;
}

function parseArgs(argv: string[]): {
  channel: string;
  text: string;
  blocks?: unknown[];
  taskId?: string;
  conversationRef?: string;
} {
  const args = argv.slice(2);
  let channel = '';
  let text = '';
  let blocks: unknown[] | undefined;
  let taskId: string | undefined;
  let conversationRef: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel' && args[i + 1]) {
      channel = args[++i];
    } else if (args[i] === '--text' && args[i + 1]) {
      text = args[++i];
    } else if (args[i] === '--blocks' && args[i + 1]) {
      blocks = JSON.parse(args[++i]) as unknown[];
    } else if (args[i] === '--task-id' && args[i + 1]) {
      taskId = args[++i];
    } else if (args[i] === '--conversation-ref' && args[i + 1]) {
      conversationRef = args[++i];
    } else if (args[i] === '--help') {
      process.stdout.write(
        'Usage: post-message.js --channel "C123" --text "Hello" [--blocks \'[...]\'] [--task-id "uuid"] [--conversation-ref <string>]\n\n' +
          'Options:\n' +
          '  --channel <id>              (required) Slack channel ID to post to\n' +
          '  --text <string>             (required) Message text\n' +
          '  --blocks <json>             Optional Block Kit blocks JSON array\n' +
          '  --task-id <uuid>            Optional task ID — auto-generates approval blocks with Approve/Reject buttons\n' +
          '  --conversation-ref <string> Optional Hostfully thread UID to track conversation for superseding detection\n' +
          '  --help                      Show this help message\n',
      );
      process.exit(0);
    }
  }

  return { channel, text, blocks, taskId, conversationRef };
}

function buildApprovalBlocks(text: string, taskId: string, date: string): unknown[] {
  return [
    {
      type: 'header',
      block_id: 'papi-chulo-daily-summary',
      text: { type: 'plain_text', text: `Daily Summary — ${date}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text },
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
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
  const { channel, text, blocks: rawBlocks, taskId, conversationRef } = parseArgs(process.argv);

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    process.stderr.write('Error: SLACK_BOT_TOKEN environment variable is required\n');
    process.exit(1);
  }

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

  const blocks = rawBlocks ?? (taskId ? buildApprovalBlocks(text, taskId, date) : undefined);

  const result = await client.chat.postMessage({
    channel,
    text,
    ...(blocks !== undefined && { blocks: blocks as import('@slack/web-api').KnownBlock[] }),
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
