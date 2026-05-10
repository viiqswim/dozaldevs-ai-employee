import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
  diagnosis?: string;
  conversationRef?: string;
  leadStatus?: string;
  dryRun: boolean;
  threadTs?: string;
  replyBroadcast: boolean;
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
  let diagnosis: string | undefined;
  let conversationRef: string | undefined;
  let leadStatus: string | undefined;
  let dryRun = false;
  let threadTs: string | undefined;
  let replyBroadcast = false;

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
    } else if (args[i] === '--diagnosis' && args[i + 1]) {
      diagnosis = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--thread-ts') {
      threadTs = args[++i];
    } else if (args[i] === '--reply-broadcast') {
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith('--')) {
        replyBroadcast = nextArg === 'true';
        i++;
      } else {
        replyBroadcast = true;
      }
    } else if (args[i] === '--conversation-ref' && args[i + 1]) {
      conversationRef = args[++i];
    } else if (args[i] === '--lead-status' && args[i + 1]) {
      leadStatus = args[++i];
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
    diagnosis,
    conversationRef,
    leadStatus,
    dryRun,
    threadTs,
    replyBroadcast,
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
        ...(params.leadStatus
          ? [
              {
                type: 'mrkdwn',
                text: `*Status:* ${
                  params.leadStatus === 'BOOKED'
                    ? '📗'
                    : params.leadStatus === 'INQUIRY'
                      ? '📙'
                      : params.leadStatus === 'CLOSED'
                        ? '📕'
                        : params.leadStatus === 'NEW'
                          ? '📘'
                          : ''
                } ${params.leadStatus}`.trim(),
              },
            ]
          : []),
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

  if (params.diagnosis) {
    try {
      const diagnosisData = JSON.parse(params.diagnosis) as {
        hasMismatch: boolean;
        diagnosisSummary: string;
      };
      const diagnosisPrefix = diagnosisData.hasMismatch ? ':warning: CODE MISMATCH — ' : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🔒 Lock Diagnosis:*\n${diagnosisPrefix}${diagnosisData.diagnosisSummary}`,
        },
      });
    } catch {
      process.stderr.write(
        'Warning: --diagnosis value is not valid JSON, skipping diagnosis block\n',
      );
    }
  }

  const normalizedMessage = params.originalMessage.replace(/\\n/g, '\n');
  const quotedMessage = normalizedMessage
    .split('\n')
    .map((line) => `>${line}`)
    .join('\n');

  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Original Message:*\n${quotedMessage}`,
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
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔗 View in Hostfully', emoji: true },
          action_id: 'view_in_hostfully',
          url: `https://platform.hostfully.com/app/#/inbox?threadUid=${params.threadUid}&leadUid=${params.leadUid}`,
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

export async function main(): Promise<void> {
  // Idempotency guard: prevent double-posting if model calls this tool twice
  const APPROVAL_OUTPUT_PATH = '/tmp/approval-message.json';
  if (existsSync(APPROVAL_OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(APPROVAL_OUTPUT_PATH, 'utf8')) as Record<
        string,
        unknown
      >;
      if (
        typeof existing.ts === 'string' &&
        existing.ts.length > 0 &&
        !/PLACEHOLDER/i.test(existing.ts)
      ) {
        process.stderr.write(
          `Idempotency guard: ${APPROVAL_OUTPUT_PATH} already exists with ts=${existing.ts} — skipping Slack post\n`,
        );
        process.stdout.write(JSON.stringify({ ts: existing.ts, channel: existing.channel }) + '\n');
        return;
      }
    } catch {
      // Malformed JSON — treat as not-posted, proceed normally
    }
  }

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

  const effectiveThreadTs =
    params.threadTs && params.threadTs.length > 0 ? params.threadTs : undefined;

  const postMessageArgs = {
    channel: params.channel,
    text: `Guest message approval request — ${params.propertyName} (${params.guestName})`,
    blocks: blocks as import('@slack/web-api').KnownBlock[],
    ...(effectiveThreadTs ? { thread_ts: effectiveThreadTs } : {}),
    ...(params.replyBroadcast && effectiveThreadTs ? { reply_broadcast: true } : {}),
  };

  const result = await client.chat.postMessage(
    postMessageArgs as Parameters<typeof client.chat.postMessage>[0],
  );

  if (!result.ok || !result.ts || !result.channel) {
    process.stderr.write(`Error: Slack postMessage failed: ${result.error ?? 'unknown'}\n`);
    process.exit(1);
  }

  const resolvedConversationRef = params.conversationRef ?? params.threadUid;
  const approvalOutput = {
    ts: result.ts,
    channel: result.channel,
    conversationRef: resolvedConversationRef,
    approval_message_ts: result.ts,
    target_channel: result.channel,
    conversation_ref: resolvedConversationRef,
    task_id: params.taskId,
    guest_name: params.guestName,
    property_name: params.propertyName,
    category: params.category,
    confidence: params.confidence,
    lead_uid: params.leadUid,
    thread_uid: params.threadUid,
    message_uid: params.messageUid,
    original_message: params.originalMessage,
    draft_response: params.draftResponse,
    check_in: params.checkIn,
    check_out: params.checkOut,
    booking_channel: params.bookingChannel,
    urgency: params.urgency,
    lead_status: params.leadStatus ?? null,
  };
  writeFileSync(APPROVAL_OUTPUT_PATH, JSON.stringify(approvalOutput));

  const output: PostResult = { ts: result.ts, channel: result.channel };
  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
