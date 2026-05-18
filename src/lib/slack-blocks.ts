import type { KnownBlock } from '@slack/web-api';
import { buildHostfullyLink } from './enrichment-adapters/hostfully.js';
import type { NotificationEnrichment } from './types/notification-enrichment.js';

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

  let mainText = `⏳ *Processing reply for ${guestName}*`;
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
}): unknown[] {
  const { emoji, text, taskId } = params;
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${emoji} *${text}*` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
    },
  ];
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
        text: `🤖 *AI skipped this task*\n_Employee: ${roleName}_\n\n*Reasoning:* ${reasoning}`,
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
        action_id: 'override_take_action',
        value: taskId,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Dismiss', emoji: true },
        action_id: 'override_dismiss',
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
    const mainText = `❌ *Task failed*${guestSuffix}${propertyLine}`;
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
    const mainText = `⏰ *Expired — no action taken*${guestSuffix}${propertyLine}`;
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

  const mainText = `❌ *Delivery failed — reply not sent*${guestSuffix}${propertyLine}`;
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
    threadUid && leadUid ? ` <${buildHostfullyLink(threadUid, leadUid)}|🔗 View>` : '';
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
  enrichment?: NotificationEnrichment | null;
  emoji?: string;
  extraText?: string;
}): KnownBlock[] {
  const { state, archetypeName, taskId, enrichment, emoji = '⏳', extraText } = params;

  const blocks: KnownBlock[] = [];

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `${emoji} *${archetypeName} — ${state}*` },
  } as KnownBlock);

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
      elements: [{ type: 'mrkdwn', text: `<${enrichment.contextUrl}|🔗 View>` }],
    } as KnownBlock);
  }

  if (extraText) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: extraText },
    } as KnownBlock);
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
  } as KnownBlock);

  return blocks;
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
