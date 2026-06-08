import type { App, ViewSubmitAction } from '@slack/bolt';
import { createLogger } from '../../../lib/logger.js';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import { ruleProposedMessage } from '../../../lib/slack-copy.js';
import type { ActionBody } from './shared.js';
import type { EmployeeRuleRepository } from '../../../repositories/employee-rule-repository.js';

const log = createLogger('slack-handlers');

export function registerRuleRephraseAction(boltApp: App, ruleRepo: EmployeeRuleRepository): void {
  boltApp.action(SLACK_ACTION_ID.RULE_REPHRASE, async ({ ack, body, client }) => {
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    if (!ruleId) {
      await ack();
      log.warn('rule_rephrase action received without ruleId');
      return;
    }
    await ack();

    const channel = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (channel && messageTs) {
      try {
        await client.chat.update({
          channel,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { ruleId, updateErr },
          'Failed to remove buttons before rule_rephrase work (non-fatal)',
        );
      }
    }

    let currentRuleText = '';
    try {
      const rule = await ruleRepo.get(ruleId);
      currentRuleText = rule?.rule_text ?? '';
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to fetch rule_text for rephrase modal');
    }

    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'rule_rephrase_modal',
          private_metadata: JSON.stringify({
            ruleId,
            channelId: channel ?? '',
            messageTs: messageTs ?? '',
          }),
          title: { type: 'plain_text', text: 'Rephrase Rule' },
          submit: { type: 'plain_text', text: 'Save' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: 'rule_input',
              label: { type: 'plain_text', text: 'Rule Text' },
              element: {
                type: 'plain_text_input',
                action_id: 'rule_text',
                multiline: true,
                initial_value: currentRuleText,
              },
            },
          ],
        },
      });
      log.info({ ruleId }, 'rule_rephrase modal opened');
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to open rule_rephrase modal');
    }
  });

  boltApp.view<ViewSubmitAction>('rule_rephrase_modal', async ({ ack, view, client }) => {
    const newText = view.state.values?.rule_input?.rule_text?.value ?? '';

    if (!newText || !newText.trim()) {
      await ack({
        response_action: 'errors',
        errors: { rule_input: 'Rule text cannot be empty.' },
      });
      return;
    }

    await ack();

    let ruleId = '';
    let rephraseChannelId = '';
    let rephraseMessageTs = '';
    try {
      const meta = JSON.parse(view.private_metadata ?? '{}') as {
        ruleId?: string;
        channelId?: string;
        messageTs?: string;
      };
      ruleId = meta.ruleId ?? '';
      rephraseChannelId = meta.channelId ?? '';
      rephraseMessageTs = meta.messageTs ?? '';
    } catch {
      log.error('Failed to parse rule_rephrase_modal private_metadata');
      return;
    }

    if (!ruleId) {
      log.error('rule_rephrase_modal submitted without ruleId in private_metadata');
      return;
    }

    if (rephraseChannelId && rephraseMessageTs) {
      try {
        await client.chat.update({
          channel: rephraseChannelId,
          ts: rephraseMessageTs,
          text: 'On it — saving your rephrase…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — saving your rephrase…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { ruleId, updateErr },
          'Failed to remove buttons before rule_rephrase_modal work (non-fatal)',
        );
      }
    }

    try {
      const updatedRule = await ruleRepo.patchRephrase(ruleId, newText.trim());
      log.info({ ruleId }, 'rule_text updated via rephrase');

      const { slack_ts, slack_channel } = updatedRule;

      if (slack_ts && slack_channel) {
        await client.chat.update({
          channel: slack_channel,
          ts: slack_ts,
          text: ruleProposedMessage(newText.trim()),
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: ruleProposedMessage(newText.trim()),
              },
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
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }],
            },
          ],
        });
        log.info({ ruleId, slack_ts, slack_channel }, 'Slack message updated after rephrase');
      }
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to process rule_rephrase_modal submission');
    }
  });
}
