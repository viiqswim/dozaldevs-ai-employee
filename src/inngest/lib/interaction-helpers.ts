import { createLogger } from '../../lib/logger.js';
import { ruleProposedMessage } from '../../lib/slack-copy.js';
import { SLACK_ACTION_ID } from '../../lib/slack-action-ids.js';
import { requireEnv } from '../../lib/config.js';
import { makePostgrestHeaders } from './postgrest-headers.js';
import type { InngestStep } from '../events.js';

const log = createLogger('interaction-handler');

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseKey = requireEnv('SUPABASE_SECRET_KEY');

export interface PreClassificationContext {
  tenantId: string;
  archetypeId: string | null;
  roleName: string | null;
}

export async function runPreClassificationShortCircuits(
  step: InngestStep,
  params: {
    taskId: string | undefined | null;
    userId: string;
    channelId: string;
    threadTs: string | undefined | null;
    text: string;
    context: PreClassificationContext;
  },
): Promise<'handled' | 'continue'> {
  const { taskId, userId, channelId, threadTs, text, context } = params;

  const awaitingInputRule = await step.run('detect-awaiting-input-rule', async () => {
    if (!taskId) return null;

    const headers = makePostgrestHeaders(supabaseKey);

    const res = await fetch(
      `${supabaseUrl}/rest/v1/employee_rules?status=eq.awaiting_input&source_task_id=eq.${taskId}&select=id,tenant_id,source`,
      { headers },
    );
    const rows = (await res.json()) as Array<{
      id: string;
      tenant_id: string;
      source: string;
    }>;
    return rows[0] ?? null;
  });

  const rejectionFeedbackRequest = await step.run('detect-rejection-feedback-request', async () => {
    if (!taskId || awaitingInputRule) return null;

    const headers = makePostgrestHeaders(supabaseKey);

    const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status,metadata`, {
      headers,
    });
    const rows = (await res.json()) as Array<{
      status: string;
      metadata: Record<string, unknown> | null;
    }>;
    const task = rows[0];
    if (!task) return null;
    if (task.status !== 'Cancelled') return null;
    const meta = task.metadata ?? {};
    if (!meta.rejection_feedback_requested) return null;
    if (meta.rejection_user_id !== userId) return null;
    return { taskId };
  });

  if (rejectionFeedbackRequest) {
    await step.run('capture-rejection-feedback', async () => {
      const headers = makePostgrestHeaders(supabaseKey);

      const feedbackRes = await fetch(`${supabaseUrl}/rest/v1/feedback_events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: crypto.randomUUID(),
          task_id: taskId ?? null,
          event_type: 'rejection_reason',
          correction_content: text,
          actor_id: userId,
          archetype_id: context.archetypeId ?? null,
          tenant_id: context.tenantId,
        }),
      });
      const feedbackRows = (await feedbackRes.json()) as Array<{ id: string }>;
      const newFeedbackId = feedbackRows[0]?.id ?? crypto.randomUUID();

      const metaRes = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`, {
        headers: makePostgrestHeaders(supabaseKey),
      });
      const metaRows = (await metaRes.json()) as Array<{
        metadata: Record<string, unknown> | null;
      }>;
      const existingMeta = metaRows[0]?.metadata ?? {};
      await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          metadata: { ...existingMeta, rejection_feedback_requested: false },
        }),
      });

      await step.sendEvent('emit-rejection-rule-extract', {
        name: 'employee/rule.extract-requested',
        data: {
          feedbackId: newFeedbackId,
          feedbackType: 'rejection_reason',
          taskId: taskId ?? null,
          archetypeId: context.archetypeId ?? null,
          tenantId: context.tenantId,
          content: text,
        },
      });

      log.info({ taskId, userId }, 'Rejection feedback captured from thread reply');
    });
    return 'handled';
  }

  if (awaitingInputRule) {
    await step.run('capture-awaiting-input-reply', async () => {
      const headers = { ...makePostgrestHeaders(supabaseKey), Prefer: 'return=minimal' };

      await fetch(`${supabaseUrl}/rest/v1/employee_rules?id=eq.${awaitingInputRule.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ rule_text: text, status: 'proposed' }),
      });

      const tokenRes = await fetch(
        `${supabaseUrl}/rest/v1/tenant_secrets?tenant_id=eq.${awaitingInputRule.tenant_id}&key=eq.slack_bot_token&select=ciphertext,iv,auth_tag`,
        { headers: makePostgrestHeaders(supabaseKey) },
      );
      const tokenRows = (await tokenRes.json()) as Array<{
        ciphertext: string;
        iv: string;
        auth_tag: string;
      }>;
      if (!tokenRows[0]) {
        log.warn(
          { ruleId: awaitingInputRule.id },
          'No slack_bot_token for awaiting_input rule — skipping Slack post',
        );
        return;
      }
      const { decrypt } = await import('../../lib/encryption.js');
      const slackToken = decrypt(tokenRows[0]);

      const ruleId = awaitingInputRule.id;
      const blocks = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: ruleProposedMessage(text) },
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Confirm' },
              style: 'primary',
              action_id: SLACK_ACTION_ID.RULE_CONFIRM,
              value: ruleId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ Reject' },
              style: 'danger',
              action_id: SLACK_ACTION_ID.RULE_REJECT,
              value: ruleId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '✏️ Rephrase' },
              action_id: SLACK_ACTION_ID.RULE_REPHRASE,
              value: ruleId,
            },
          ],
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
      ];

      const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${slackToken}` },
        body: JSON.stringify({
          channel: channelId,
          text: ruleProposedMessage(text),
          blocks,
          ...(threadTs ? { thread_ts: threadTs } : {}),
        }),
      });
      const slackData = (await slackRes.json()) as {
        ok: boolean;
        ts?: string;
        channel?: string;
        error?: string;
      };

      if (!slackData.ok) {
        log.warn(
          { ruleId, error: slackData.error },
          'Failed to post rule review after awaiting_input capture',
        );
        return;
      }

      await fetch(`${supabaseUrl}/rest/v1/employee_rules?id=eq.${ruleId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          slack_ts: slackData.ts,
          slack_channel: slackData.channel ?? channelId,
        }),
      });

      log.info(
        { ruleId, userId },
        'Awaiting-input rule captured from thread reply — status: proposed',
      );
    });
    return 'handled';
  }

  return 'continue';
}
