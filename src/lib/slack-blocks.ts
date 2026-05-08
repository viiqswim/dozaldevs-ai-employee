import type { KnownBlock } from '@slack/web-api';

export function buildSupersededBlocks(): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⏭️ *Superseded* — a newer message from this guest is pending review below.\n_This suggested response was not sent._',
      },
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
