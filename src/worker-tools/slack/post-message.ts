import fs from 'fs';

import { WebClient } from '@slack/web-api';

import { unescapeShellArg } from '../lib/unescape-args.js';

interface PostResult {
  ts: string;
  channel: string;
  conversationRef?: string;
}

/** **bold** → *bold*  ·  ~~strike~~ → ~strike~ */
function markdownToMrkdwn(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/gs, '*$1*').replace(/~~(.+?)~~/gs, '~$1~');
}

function parseArgs(argv: string[]): {
  channel: string;
  text: string;
  blocks?: unknown[];
  taskId?: string;
  conversationRef?: string;
  title?: string;
  threadTs?: string;
  textFile?: string;
} {
  const args = argv.slice(2);
  let channel = '';
  let text = '';
  let blocks: unknown[] | undefined;
  let taskId: string | undefined;
  let conversationRef: string | undefined;
  let title: string | undefined;
  let threadTs: string | undefined;
  let textFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel' && args[i + 1]) {
      channel = args[++i];
    } else if (args[i] === '--text' && args[i + 1]) {
      text = unescapeShellArg(args[++i]);
    } else if (args[i] === '--blocks' && args[i + 1]) {
      blocks = JSON.parse(args[++i]) as unknown[];
    } else if (args[i] === '--task-id' && args[i + 1]) {
      taskId = args[++i];
    } else if (args[i] === '--conversation-ref' && args[i + 1]) {
      conversationRef = args[++i];
    } else if (args[i] === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (args[i] === '--thread-ts' && args[i + 1]) {
      threadTs = args[++i];
    } else if (args[i] === '--text-file' && args[i + 1]) {
      textFile = args[++i];
    } else if (args[i] === '--no-thread') {
      // Deprecated — no-op. NOTIFY_MSG_TS always threads task messages together.
    } else if (args[i] === '--help') {
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
  }

  if (threadTs === undefined) {
    const envTs = process.env.NOTIFY_MSG_TS;
    if (envTs) threadTs = envTs;
  }

  return { channel, text, blocks, taskId, conversationRef, title, threadTs, textFile };
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
  const {
    channel,
    text: parsedText,
    blocks: rawBlocks,
    taskId,
    conversationRef,
    title,
    threadTs,
    textFile,
  } = parseArgs(process.argv);

  let text = parsedText;

  if (textFile && !text) {
    if (!fs.existsSync(textFile)) {
      process.stderr.write(`Error: --text-file path does not exist: ${textFile}\n`);
      process.exit(1);
    }
    text = fs.readFileSync(textFile, 'utf8').trim();
  }

  text = markdownToMrkdwn(text);

  const runId = process.env.INNGEST_RUN_ID || undefined;

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

  const effectiveTaskId = taskId ?? process.env.TASK_ID ?? undefined;
  const isDeliveryPhase = process.env.EMPLOYEE_PHASE === 'delivery';

  const blocks =
    rawBlocks ??
    (effectiveTaskId
      ? isDeliveryPhase || process.env.APPROVAL_REQUIRED === 'false'
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
