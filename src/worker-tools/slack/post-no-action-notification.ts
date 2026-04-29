import { WebClient } from '@slack/web-api';

interface NoActionParams {
  channel: string;
  taskId: string;
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  bookingChannel: string;
  originalMessage: string;
  summary: string;
  confidence: number;
  category: string;
  leadUid: string;
  threadUid: string;
  messageUid: string;
  conversationSummary?: string;
  dryRun: boolean;
}

interface PostResult {
  ts: string;
  channel: string;
}

function parseArgs(argv: string[]): NoActionParams {
  const args = argv.slice(2);
  let channel = '';
  let taskId = '';
  let guestName = '';
  let propertyName = '';
  let checkIn = '';
  let checkOut = '';
  let bookingChannel = '';
  let originalMessage = '';
  let summary = '';
  let confidence = NaN;
  let category = '';
  let leadUid = '';
  let threadUid = '';
  let messageUid = '';
  let conversationSummary: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel' && args[i + 1]) {
      channel = args[++i];
    } else if (args[i] === '--task-id' && args[i + 1]) {
      taskId = args[++i];
    } else if (args[i] === '--guest-name' && args[i + 1]) {
      guestName = args[++i];
    } else if (args[i] === '--property-name' && args[i + 1]) {
      propertyName = args[++i];
    } else if (args[i] === '--check-in' && args[i + 1]) {
      checkIn = args[++i];
    } else if (args[i] === '--check-out' && args[i + 1]) {
      checkOut = args[++i];
    } else if (args[i] === '--booking-channel' && args[i + 1]) {
      bookingChannel = args[++i];
    } else if (args[i] === '--original-message' && args[i + 1]) {
      originalMessage = args[++i];
    } else if (args[i] === '--summary' && args[i + 1]) {
      summary = args[++i];
    } else if (args[i] === '--confidence' && args[i + 1]) {
      confidence = parseFloat(args[++i]);
    } else if (args[i] === '--category' && args[i + 1]) {
      category = args[++i];
    } else if (args[i] === '--lead-uid' && args[i + 1]) {
      leadUid = args[++i];
    } else if (args[i] === '--thread-uid' && args[i + 1]) {
      threadUid = args[++i];
    } else if (args[i] === '--message-uid' && args[i + 1]) {
      messageUid = args[++i];
    } else if (args[i] === '--conversation-summary' && args[i + 1]) {
      conversationSummary = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return {
    channel,
    taskId,
    guestName,
    propertyName,
    checkIn,
    checkOut,
    bookingChannel,
    originalMessage,
    summary,
    confidence,
    category,
    leadUid,
    threadUid,
    messageUid,
    conversationSummary,
    dryRun,
  };
}

export function buildNoActionBlocks(params: NoActionParams): unknown[] {
  const confidencePct = Math.round(params.confidence * 100);

  const truncatedMessage =
    params.originalMessage.length > 300
      ? params.originalMessage.substring(0, 300) + '...'
      : params.originalMessage;

  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `ℹ️ No Action Needed — ${params.propertyName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Guest:* ${params.guestName}` },
        { type: 'mrkdwn', text: `*Property:* ${params.propertyName}` },
        { type: 'mrkdwn', text: `*Check-in:* ${params.checkIn}` },
        { type: 'mrkdwn', text: `*Check-out:* ${params.checkOut}` },
        { type: 'mrkdwn', text: `*Booking Channel:* ${params.bookingChannel}` },
      ],
    },
    { type: 'divider' },
  ];

  if (params.conversationSummary) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Conversation Summary:*\n${params.conversationSummary}`,
      },
    });
  }

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Guest message:*\n>${truncatedMessage}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Summary:* ${params.summary}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_No response is needed. Classification: ${params.category} (confidence: ${confidencePct}%)_`,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '💬 Reply Anyway', emoji: true },
          action_id: 'guest_reply_anyway',
          value: params.taskId,
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Task \`${params.taskId}\`` }],
    },
  );

  return blocks;
}

async function main(): Promise<void> {
  const params = parseArgs(process.argv);

  const requiredStrings: Array<[string, string]> = [
    [params.channel, '--channel'],
    [params.taskId, '--task-id'],
    [params.guestName, '--guest-name'],
    [params.propertyName, '--property-name'],
    [params.checkIn, '--check-in'],
    [params.checkOut, '--check-out'],
    [params.bookingChannel, '--booking-channel'],
    [params.originalMessage, '--original-message'],
    [params.summary, '--summary'],
    [params.category, '--category'],
    [params.leadUid, '--lead-uid'],
    [params.threadUid, '--thread-uid'],
    [params.messageUid, '--message-uid'],
  ];

  for (const [val, flag] of requiredStrings) {
    if (!val) {
      process.stderr.write(`Error: ${flag} argument is required\n`);
      process.exit(1);
    }
  }

  if (isNaN(params.confidence)) {
    process.stderr.write('Error: --confidence argument is required\n');
    process.exit(1);
  }

  const blocks = buildNoActionBlocks(params);

  if (params.dryRun) {
    process.stdout.write(JSON.stringify({ blocks }) + '\n');
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    process.stderr.write('Error: SLACK_BOT_TOKEN environment variable is required\n');
    process.exit(1);
  }

  const client = new WebClient(token);

  const result = await client.chat.postMessage({
    channel: params.channel,
    text: `No action needed — ${params.propertyName} (${params.guestName})`,
    blocks: blocks as import('@slack/web-api').KnownBlock[],
  });

  if (!result.ok || !result.ts || !result.channel) {
    process.stderr.write(`Error: Slack postMessage failed: ${result.error ?? 'unknown'}\n`);
    process.exit(1);
  }

  const output: PostResult = { ts: result.ts, channel: result.channel };
  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
