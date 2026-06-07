import type { KnownBlock } from '@slack/web-api';
import { buildHostfullyLink } from './enrichment-adapters/hostfully.js';
import type { NotificationEnrichment } from './types/notification-enrichment.js';
import { SLACK_ACTION_ID } from './slack-action-ids.js';
import { expiredMessage } from './slack-copy.js';

export function buildSupersededBlocks(taskId: string): unknown[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⏭️ *Superseded* — a newer message from this guest is pending review below.\n_This suggested response was not sent._',
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
    },
  ];
}

export function buildEnrichedNotifyBlocks(params: {
  guestName: string;
  propertyName?: string;
  checkIn?: string;
  checkOut?: string;
  bookingChannel?: string;
  messageSnippet?: string;
  taskId: string;
}): unknown[] {
  const { guestName, propertyName, checkIn, checkOut, bookingChannel, messageSnippet, taskId } =
    params;

  const subtitleParts: string[] = [];
  if (propertyName) subtitleParts.push(propertyName);
  if (bookingChannel) subtitleParts.push(bookingChannel);
  if (checkIn && checkOut) subtitleParts.push(`${checkIn}–${checkOut}`);

  let mainText = `⏳ *Working on a reply for ${guestName}*`;
  if (subtitleParts.length > 0) {
    mainText += `\n_${subtitleParts.join(' · ')}_`;
  }
  if (messageSnippet) {
    const snippet =
      messageSnippet.length > 120 ? `${messageSnippet.slice(0, 120)}...` : messageSnippet;
    mainText += `\n> "${snippet}"`;
  }

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: mainText },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
    },
  ];
}

export function buildNotifyStateBlocks(params: {
  emoji: string;
  text: string;
  taskId: string;
  runId?: string;
}): unknown[] {
  const { emoji, text, taskId, runId } = params;

  const textLower = text.toLowerCase();
  const isNoAction =
    textLower.includes('no action') || textLower.includes('complete') || textLower.includes('done');
  const isFailed = textLower.includes('fail') || textLower.includes('error');
  const isReviewing = textLower.includes('review') || textLower.includes('awaiting');
  const isProcessing =
    textLower.includes('process') ||
    textLower.includes('received') ||
    textLower.includes('executing');

  let statusEmoji: string;
  let statusLabel: string;
  if (isNoAction) {
    statusEmoji = '✅';
    statusLabel = 'Complete';
  } else if (isFailed) {
    statusEmoji = '🔴';
    statusLabel = 'Failed';
  } else if (isReviewing) {
    statusEmoji = '🔶';
    statusLabel = 'Needs Review';
  } else if (isProcessing) {
    statusEmoji = '🔄';
    statusLabel = 'Processing';
  } else {
    statusEmoji = emoji;
    statusLabel = text;
  }

  const blocks: unknown[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${statusEmoji} *${statusLabel}*` },
    },
  ];

  if (isProcessing) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: "⏳ On it — I'll post an update here when it's ready" }],
    });
  } else if (isReviewing) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: '👀 *Needs your review* — take a look when you get a chance' },
      ],
    });
  } else if (isNoAction) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '✅ All done!' }],
    });
  } else if (isFailed) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '❌ Something went wrong on my end — check the thread for details',
        },
      ],
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `Task \`${taskId}\`` },
      ...(runId ? [{ type: 'mrkdwn', text: `Run \`${runId}\`` }] : []),
    ],
  });

  return blocks;
}

export function buildNoActionThreadBlocks(params: {
  reasoning: string;
  taskId: string;
  propertyUid?: string;
  leadUid?: string;
}): unknown[] {
  const { reasoning, taskId, propertyUid, leadUid } = params;

  const contextParts: string[] = [];
  if (propertyUid) contextParts.push(`Property \`${propertyUid}\``);
  if (leadUid) contextParts.push(`Lead \`${leadUid}\``);
  contextParts.push(`Task \`${taskId}\``);

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `ℹ️ *No action needed*\n${reasoning}` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: contextParts.join(' | ') }],
    },
  ];
}

export function buildOverrideCardBlocks(params: {
  reasoning: string;
  taskId: string;
  roleName: string;
  displayContext?: Record<string, string>;
}): unknown[] {
  const { reasoning, taskId, roleName, displayContext } = params;

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `ℹ️ *I decided to skip this one*\n_${roleName}_\n\n${reasoning}`,
      },
    },
  ];

  if (displayContext && Object.keys(displayContext).length > 0) {
    blocks.push({
      type: 'context',
      elements: Object.entries(displayContext).map(([label, value]) => ({
        type: 'mrkdwn',
        text: `*${label}:* ${value}`,
      })),
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '🔄 Take Action', emoji: true },
        action_id: SLACK_ACTION_ID.OVERRIDE_TAKE_ACTION,
        value: taskId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Dismiss', emoji: true },
        action_id: SLACK_ACTION_ID.OVERRIDE_DISMISS,
        value: taskId,
      },
    ],
  });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
  });

  return blocks;
}

export function buildEnrichedTerminalBlocks(params: {
  status: 'done' | 'rejected' | 'failed' | 'expired' | 'delivery_failed';
  actorUserId?: string;
  guestName?: string;
  propertyName?: string;
  threadUid?: string;
  leadUid?: string;
  sentSnippet?: string;
  taskId: string;
  timestamp?: number;
}): unknown[] {
  const {
    status,
    actorUserId,
    guestName,
    propertyName,
    threadUid,
    leadUid,
    sentSnippet,
    taskId,
    timestamp,
  } = params;

  const epoch = Math.floor(timestamp ?? Date.now() / 1000);
  const isoFallback = new Date(epoch * 1000).toISOString();
  const slackDate = `<!date^${epoch}^{date_short_pretty} at {time}|${isoFallback}>`;

  const hasHostfullyLink = threadUid && leadUid;
  const hostfullyMrkdwn = hasHostfullyLink
    ? `<${buildHostfullyLink(threadUid, leadUid)}|🔗 View in Hostfully>`
    : null;

  const guestSuffix = guestName ? ` · ${guestName}` : '';
  const propertyLine = propertyName ? `\n_${propertyName}_` : '';
  const actorMention = actorUserId ? `<@${actorUserId}>` : 'Unknown';

  const contextBlock = {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
  };

  const blocks: unknown[] = [];

  if (status === 'done') {
    const mainText = `✅ *Approved by ${actorMention}*${guestSuffix}${propertyLine}`;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: mainText },
    });

    if (sentSnippet) {
      const normalizedSnippet = sentSnippet.replace(/\\n/g, '\n');
      const snippet =
        normalizedSnippet.length > 150 ? `${normalizedSnippet.slice(0, 150)}…` : normalizedSnippet;
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `> ${snippet}` },
      });
    }

    const footerParts: string[] = [];
    if (hostfullyMrkdwn) footerParts.push(hostfullyMrkdwn);
    footerParts.push(slackDate);

    if (footerParts.length > 0) {
      blocks.push({
        type: 'context',
        elements: footerParts.map((text) => ({ type: 'mrkdwn', text })),
      });
    }

    blocks.push(contextBlock);
    return blocks;
  }

  if (status === 'rejected') {
    const mainText = `❌ *Rejected by ${actorMention}*${guestSuffix}${propertyLine}`;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: mainText },
    });

    const footerParts: string[] = [];
    if (hostfullyMrkdwn) footerParts.push(hostfullyMrkdwn);
    footerParts.push(slackDate);

    if (footerParts.length > 0) {
      blocks.push({
        type: 'context',
        elements: footerParts.map((text) => ({ type: 'mrkdwn', text })),
      });
    }

    blocks.push(contextBlock);
    return blocks;
  }

  if (status === 'failed') {
    const mainText = `❌ *Something went wrong*${guestSuffix}${propertyLine}`;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: mainText },
    });

    if (hostfullyMrkdwn) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: hostfullyMrkdwn }],
      });
    }

    blocks.push(contextBlock);
    return blocks;
  }

  if (status === 'expired') {
    const mainText = `${expiredMessage()}${guestSuffix}${propertyLine}`;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: mainText },
    });

    if (hostfullyMrkdwn) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: hostfullyMrkdwn }],
      });
    }

    blocks.push(contextBlock);
    return blocks;
  }

  const mainText = `❌ *Delivery failed — the reply wasn't sent*${guestSuffix}${propertyLine}`;
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: mainText },
  });

  if (hostfullyMrkdwn) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: hostfullyMrkdwn }],
    });
  }

  blocks.push(contextBlock);
  return blocks;
}

export function buildCompactNotifyBlocks(params: {
  status:
    | 'processing'
    | 'reviewing'
    | 'done'
    | 'rejected'
    | 'failed'
    | 'expired'
    | 'delivery_failed'
    | 'no_action'
    | 'superseded';
  guestName?: string;
  propertyName?: string;
  actorUserId?: string;
  threadUid?: string;
  leadUid?: string;
  taskId: string;
}): unknown[] {
  const { status, guestName, propertyName, actorUserId, threadUid, leadUid, taskId } = params;

  const identity = [guestName, propertyName].filter(Boolean).join(' · ');
  const linkText =
    threadUid && leadUid ? ` <${buildHostfullyLink(threadUid, leadUid)}|🔗 View in Hostfully>` : '';
  const actorMention = actorUserId ? `<@${actorUserId}>` : 'Unknown';

  let statusText: string;
  switch (status) {
    case 'processing':
      statusText = `Processing${linkText}`;
      break;
    case 'reviewing':
      statusText = `Awaiting approval${linkText}`;
      break;
    case 'done':
      statusText = `Reply sent · ${actorMention}${linkText}`;
      break;
    case 'rejected':
      statusText = `Rejected · ${actorMention}${linkText}`;
      break;
    case 'failed':
      statusText = `Failed${linkText}`;
      break;
    case 'expired':
      statusText = `Expired${linkText}`;
      break;
    case 'delivery_failed':
      statusText = `Delivery failed${linkText}`;
      break;
    case 'no_action':
      statusText = `No action needed${linkText}`;
      break;
    case 'superseded':
      statusText = `Superseded${linkText}`;
      break;
  }

  let emoji: string;
  switch (status) {
    case 'processing':
    case 'reviewing':
      emoji = '⏳';
      break;
    case 'done':
    case 'no_action':
      emoji = '✅';
      break;
    case 'expired':
      emoji = '⏰';
      break;
    case 'superseded':
      emoji = '⏭️';
      break;
    default:
      emoji = '❌';
  }

  const mainText = identity ? `*${emoji} ${identity} — ${statusText}*` : `*${emoji} ${statusText}*`;

  return [
    { type: 'section', text: { type: 'mrkdwn', text: mainText } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
  ];
}

export function buildNotifyBlocks(params: {
  state: string;
  archetypeName: string;
  taskId: string;
  runId?: string;
  enrichment?: NotificationEnrichment | null;
  emoji?: string;
  extraText?: string;
  sentSnippet?: string;
  threadHint?: boolean;
}): KnownBlock[] {
  const {
    state,
    archetypeName,
    taskId,
    runId,
    enrichment,
    emoji = '⏳',
    extraText,
    sentSnippet,
    threadHint,
  } = params;

  const blocks: KnownBlock[] = [];

  const stateLower = state.toLowerCase();
  const isProcessing =
    stateLower === 'received' || stateLower === 'executing' || stateLower === 'submitting';
  const isReviewing = stateLower === 'reviewing';
  const isDone =
    stateLower === 'done' || stateLower === 'complete' || stateLower === 'task complete';
  const isFailed = stateLower === 'failed';

  let statusEmoji: string;
  let statusLabel: string;
  if (isProcessing) {
    statusEmoji = '🔄';
    statusLabel = 'Processing';
  } else if (isReviewing) {
    statusEmoji = '🔶';
    statusLabel = 'Needs Review';
  } else if (isDone) {
    statusEmoji = '✅';
    statusLabel = 'Complete';
  } else if (isFailed) {
    statusEmoji = '🔴';
    statusLabel = 'Failed';
  } else {
    statusEmoji = emoji;
    statusLabel = state;
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `${statusEmoji} *${archetypeName} — ${statusLabel}*` },
  } as KnownBlock);

  if (isProcessing) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: "⏳ On it — I'll post an update here when it's ready" }],
    } as KnownBlock);
  } else if (isReviewing) {
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: '👀 *Needs your review* — take a look when you get a chance' },
      ],
    } as KnownBlock);
  } else if (isDone) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '✅ All done!' }],
    } as KnownBlock);
  } else if (isFailed) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '❌ Something went wrong on my end — check the thread for details',
        },
      ],
    } as KnownBlock);
  }

  if (enrichment?.displayName || enrichment?.subtitle) {
    const fields: { type: 'mrkdwn'; text: string }[] = [];
    if (enrichment.displayName) {
      fields.push({ type: 'mrkdwn', text: enrichment.displayName });
    }
    if (enrichment.subtitle) {
      fields.push({ type: 'mrkdwn', text: enrichment.subtitle });
    }
    blocks.push({ type: 'section', fields } as KnownBlock);
  }

  if (enrichment?.metadata && Object.keys(enrichment.metadata).length > 0) {
    const metadataText = Object.entries(enrichment.metadata)
      .map(([key, value]) => `*${key}:* ${value}`)
      .join(' · ');
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: metadataText }],
    } as KnownBlock);
  }

  if (enrichment?.contextUrl) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${enrichment.contextUrl}|🔗 View in Hostfully>` }],
    } as KnownBlock);
  }

  if (extraText) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: extraText },
    } as KnownBlock);
  }

  if (sentSnippet) {
    const snippet = sentSnippet.length > 150 ? `${sentSnippet.slice(0, 150)}…` : sentSnippet;
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${snippet}` },
    } as KnownBlock);
  }

  if (threadHint) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: '_See thread for full details_' }],
    } as KnownBlock);
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `Task \`${taskId}\`` },
      ...(runId ? [{ type: 'mrkdwn', text: `Run \`${runId}\`` }] : []),
    ],
  } as KnownBlock);

  return blocks;
}

export function createTaskNotifyBuilders({ taskId, runId }: { taskId: string; runId?: string }) {
  return {
    notifyBlocks: (params: Omit<Parameters<typeof buildNotifyBlocks>[0], 'taskId' | 'runId'>) =>
      buildNotifyBlocks({ ...params, taskId, runId }),
    notifyStateBlocks: (
      params: Omit<Parameters<typeof buildNotifyStateBlocks>[0], 'taskId' | 'runId'>,
    ) => buildNotifyStateBlocks({ ...params, taskId, runId }),
  };
}

export function buildContextThreadBlocks(params: {
  action: 'approve' | 'edit' | 'reject';
  actorUserId?: string;
  guestName?: string;
  propertyName?: string;
  checkIn?: string;
  checkOut?: string;
  bookingChannel?: string;
  originalMessage?: string;
  sentResponse?: string;
  draftResponse?: string;
  editedResponse?: string;
  confidence?: number;
  category?: string;
  threadUid?: string;
  leadUid?: string;
  taskId: string;
}): unknown[] {
  const {
    action,
    guestName,
    checkIn,
    checkOut,
    bookingChannel,
    originalMessage,
    sentResponse,
    draftResponse,
    editedResponse,
    confidence,
    category,
    threadUid,
    leadUid,
    taskId,
  } = params;

  const blocks: unknown[] = [];

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `📋 *Message Context* — preserved for reference` },
  });

  const contextRowParts: string[] = [];
  if (guestName) contextRowParts.push(`*Guest:* ${guestName}`);
  if (checkIn && checkOut) contextRowParts.push(`*Dates:* ${checkIn}–${checkOut}`);
  if (bookingChannel) contextRowParts.push(`*Channel:* ${bookingChannel}`);
  if (contextRowParts.length > 0) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: contextRowParts.join(' | ') }],
    });
  }

  if (originalMessage) {
    const quotedMessage = originalMessage
      .split('\n')
      .map((line) => `>${line}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*💬 Guest message:*\n${quotedMessage}` },
    });
  }

  if (action === 'approve' && sentResponse) {
    const quotedSent = sentResponse
      .split('\n')
      .map((line) => `>${line}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*📤 Response sent to guest:*\n${quotedSent}` },
    });
  } else if (action === 'edit') {
    if (draftResponse) {
      const quotedDraft = draftResponse
        .split('\n')
        .map((line) => `>${line}`)
        .join('\n');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*🤖 Original AI draft:*\n${quotedDraft}` },
      });
    }
    if (editedResponse) {
      const quotedEdited = editedResponse
        .split('\n')
        .map((line) => `>${line}`)
        .join('\n');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*✏️ Edited response (sent):*\n${quotedEdited}` },
      });
    }
  } else if (action === 'reject' && draftResponse) {
    const quotedDraft = draftResponse
      .split('\n')
      .map((line) => `>${line}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🤖 AI suggested response (not sent):*\n${quotedDraft}` },
    });
  }

  const footerElements: unknown[] = [];
  const hasHostfullyLink = threadUid && leadUid;
  if (hasHostfullyLink) {
    footerElements.push({
      type: 'mrkdwn',
      text: `<${buildHostfullyLink(threadUid, leadUid)}|🔗 View in Hostfully>`,
    });
  }
  if (confidence !== undefined) {
    const pct = Math.round(confidence * 100);
    footerElements.push({ type: 'mrkdwn', text: `Confidence: ${pct}%` });
  }
  if (category) {
    footerElements.push({ type: 'mrkdwn', text: `Category: ${category}` });
  }
  if (footerElements.length > 0) {
    blocks.push({ type: 'context', elements: footerElements });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
  });

  return blocks;
}
