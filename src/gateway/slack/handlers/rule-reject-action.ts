import type { App } from '@slack/bolt';
import { createLogger } from '../../../lib/logger.js';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import type { ActionBody } from './shared.js';
import type { EmployeeRuleRepository } from '../../../repositories/employee-rule-repository.js';

const log = createLogger('slack-handlers');

export function registerRuleRejectAction(boltApp: App, ruleRepo: EmployeeRuleRepository): void {
  boltApp.action(SLACK_ACTION_ID.RULE_REJECT, async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channel = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;
    if (!ruleId) return;

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
          'Failed to remove buttons before rule_reject work (non-fatal)',
        );
      }
    }

    try {
      const patchedRule = await ruleRepo.patchReject(ruleId);
      const ruleText = patchedRule.rule_text;
      log.info({ ruleId, userId: user.id }, 'Rule rejected');

      if (channel && messageTs) {
        const displayText = ruleText
          ? `❌ Rule rejected by <@${user.id}>\n\n> ${ruleText}`
          : `❌ Rule rejected by <@${user.id}>`;
        await client.chat.update({
          channel,
          ts: messageTs,
          text: displayText,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: displayText } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      }
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to PATCH employee_rules on reject');
      if (channel && messageTs) {
        try {
          await client.chat.update({
            channel,
            ts: messageTs,
            text: `❌ Rule rejected by <@${user.id}>`,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `❌ Rule rejected by <@${user.id}>` },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn(
            { ruleId, updateErr },
            'Failed to update Slack message after rule_reject error (non-fatal)',
          );
        }
      }
    }
  });
}
