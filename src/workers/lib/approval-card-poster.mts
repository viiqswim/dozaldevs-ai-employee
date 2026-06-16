import type { KnownBlock } from '@slack/web-api';
import { WebClient } from '@slack/web-api';
import type { StandardOutput } from './output-schema.mjs';
import { SLACK_ACTION_ID } from '../../lib/slack-action-ids.js';

export interface ApprovalBlockData {
  summary: string;
  draft?: string;
  classification: string;
  confidence?: number;
  urgency?: boolean;
  taskId: string;
}

export interface PostApprovalCardParams {
  data: Omit<StandardOutput, 'classification'> & { classification: string };
  taskId: string;
  channel: string;
  token: string;
  threadTs?: string;
}

export interface PostApprovalCardResult {
  ts: string;
  channel: string;
}

/**
 * Build Slack Block Kit blocks for a generic employee approval card.
 * Employee-agnostic — no guest, property, or domain-specific language.
 */
export function buildApprovalBlocks(data: ApprovalBlockData): KnownBlock[] {
  const headerPrefix = data.urgency ? '⚠️ ' : '📝 ';
  // Slack header blocks (plain_text) hard-cap at 150 characters. The prefix counts
  // toward that limit, so the summary slice must leave room for it — otherwise Slack
  // rejects the whole message with invalid_blocks and the approval card never posts.
  // Use 148 to stay safely under the cap (emoji can count as >1 char in Slack's tally).
  const HEADER_MAX = 148;
  const headerText = `${headerPrefix}${data.summary}`.slice(0, HEADER_MAX);

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: headerText,
        emoji: true,
      },
    } as KnownBlock,
  ];

  if (data.draft) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Draft response:*\n${data.draft.slice(0, 3000)}`,
      },
    } as KnownBlock);
  }

  // Classification badge + confidence + urgency context
  const classificationBadge =
    data.classification === 'NO_ACTION_NEEDED' ? '✅ NO_ACTION_NEEDED' : '🔔 NEEDS_APPROVAL';
  const contextParts: string[] = [classificationBadge];
  if (data.confidence !== undefined) {
    contextParts.push(`${Math.round(data.confidence * 100)}% confidence`);
  }
  if (data.urgency) {
    contextParts.push('🚨 URGENT');
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: contextParts.join(' · ') }],
  } as KnownBlock);

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '✅ Approve', emoji: true },
        action_id: SLACK_ACTION_ID.APPROVE,
        value: data.taskId,
        style: 'primary',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '❌ Reject', emoji: true },
        action_id: SLACK_ACTION_ID.REJECT,
        value: data.taskId,
        style: 'danger',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Edit & Send', emoji: true },
        action_id: SLACK_ACTION_ID.EDIT_AND_SEND,
        value: (() => {
          const raw = JSON.stringify({ taskId: data.taskId, draftResponse: data.draft ?? '' });
          if (raw.length <= 1900) return raw;
          const baseLen = JSON.stringify({ taskId: data.taskId, draftResponse: '' }).length;
          const maxDraft = 1900 - baseLen - 3;
          return JSON.stringify({
            taskId: data.taskId,
            draftResponse: (data.draft ?? '').substring(0, Math.max(0, maxDraft)) + '...',
          });
        })(),
      },
    ],
  } as KnownBlock);

  // Mandatory task ID context block (Slack Message Standards)
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Task \`${data.taskId}\`` }],
  } as KnownBlock);

  return blocks;
}

/**
 * Post a generic approval card to Slack and return the message timestamp + channel.
 * Throws on failure — callers must handle errors.
 */
export async function postApprovalCard(
  params: PostApprovalCardParams,
): Promise<PostApprovalCardResult> {
  const client = new WebClient(params.token);

  const blocks = buildApprovalBlocks({
    ...params.data,
    taskId: params.taskId,
  });

  const response = await client.chat.postMessage({
    channel: params.channel,
    blocks,
    text: params.data.summary,
    ...(params.threadTs ? { thread_ts: params.threadTs } : {}),
  });

  if (!response.ok || !response.ts || !response.channel) {
    throw new Error(
      `Slack postMessage failed: ${response.error ?? 'missing ts/channel in response'}`,
    );
  }

  return { ts: response.ts, channel: response.channel };
}
