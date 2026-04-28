import { WebClient } from '@slack/web-api';

interface GuestApprovalParams {
  channel: string;
  taskId: string;
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  bookingChannel: string;
  originalMessage: string;
  draftResponse: string;
  confidence: number;
  category: string;
  leadUid: string;
  threadUid: string;
  messageUid: string;
  urgency: boolean;
  conversationSummary?: string;
  dryRun: boolean;
}

interface PostResult {
  ts: string;
  channel: string;
}

function parseArgs(argv: string[]): GuestApprovalParams {
  const args = argv.slice(2);
  let channel = '';
  let taskId = '';
  let guestName = '';
  let propertyName = '';
  let checkIn = '';
  let checkOut = '';
  let bookingChannel = '';
  let originalMessage = '';
  let draftResponse = '';
  let confidence = NaN;
  let category = '';
  let leadUid = '';
  let threadUid = '';
  let messageUid = '';
  let urgency = false;
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
    } else if (args[i] === '--draft-response' && args[i + 1]) {
      draftResponse = args[++i];
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
    } else if (args[i] === '--urgency') {
      urgency = true;
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
    draftResponse,
    confidence,
    category,
    leadUid,
    threadUid,
    messageUid,
    urgency,
    conversationSummary,
    dryRun,
  };
}

/**
 * Build the edit button value JSON, truncated to <= 1900 chars so Slack's
 * 2000-char button value limit is never reached.
 */
function buildEditButtonValue(taskId: string, draftResponse: string): string {
  const raw = JSON.stringify({ taskId, draftResponse });
  if (raw.length <= 1900) return raw;

  const baseOverhead = JSON.stringify({ taskId, draftResponse: '' }).length;
  const maxDraftChars = 1900 - baseOverhead - 3;
  const truncated = draftResponse.substring(0, Math.max(0, maxDraftChars));
  return JSON.stringify({ taskId, draftResponse: truncated + '...' });
}
export function buildGuestApprovalBlocks(params: GuestApprovalParams): unknown[] {
  const headerEmoji = params.urgency ? ':warning:' : ':rotating_light:';

  const confidencePct = Math.round(params.confidence * 100);
  let confidenceText = `*Confidence:* ${confidencePct}% | *Category:* \`${params.category}\``;
  if (params.urgency) {
    confidenceText += ' | :rotating_light: *Urgent*';
  }

  const editValue = buildEditButtonValue(params.taskId, params.draftResponse);

  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${headerEmoji} Guest Message — ${params.propertyName}`,
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
        text: `*Original Message:*\n>${params.originalMessage}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Proposed Response:*\n${params.draftResponse}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: confidenceText,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve & Send', emoji: true },
          action_id: 'guest_approve',
          value: params.taskId,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '✏️ Edit & Send', emoji: true },
          action_id: 'guest_edit',
          value: editValue,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject', emoji: true },
          action_id: 'guest_reject',
          value: params.taskId,
          style: 'danger',
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
    [params.draftResponse, '--draft-response'],
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

  const blocks = buildGuestApprovalBlocks(params);

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
    text: `Guest message approval request — ${params.propertyName} (${params.guestName})`,
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
