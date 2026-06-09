import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import { createLogger } from '../../../lib/logger.js';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import { getPlatformSetting } from '../../../lib/platform-settings.js';
import type { ActionBody } from './shared.js';
import type { EmployeeRuleRepository } from '../../../repositories/employee-rule-repository.js';

const log = createLogger('slack-handlers');

export function registerRuleConfirmAction(
  boltApp: App,
  inngest: InngestLike,
  ruleRepo: EmployeeRuleRepository,
): void {
  boltApp.action(SLACK_ACTION_ID.RULE_CONFIRM, async ({ ack, body, client }) => {
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
          'Failed to remove buttons before rule_confirm work (non-fatal)',
        );
      }
    }

    try {
      const patchedRule = await ruleRepo.patchConfirm(ruleId, user.id);

      if (channel && messageTs) {
        const ruleText = patchedRule.rule_text;
        const displayText = ruleText
          ? `✅ Rule confirmed by <@${user.id}>\n\n> ${ruleText}`
          : `✅ Rule confirmed by <@${user.id}>`;
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

      const {
        tenant_id: tenantId,
        archetype_id: archetypeId,
        source,
        parent_rule_ids: parentRuleIds,
      } = patchedRule;
      log.info({ ruleId, userId: user.id }, 'Rule confirmed');

      await inngest.send({
        name: 'employee/rule.confirmed',
        data: { ruleId, tenantId, archetypeId, confirmedBy: user.id },
      });

      const confirmedCount = await ruleRepo.countConfirmed(archetypeId);

      if (
        confirmedCount > 0 &&
        confirmedCount % parseInt(await getPlatformSetting('synthesis_threshold'), 10) === 0
      ) {
        await inngest.send({
          name: 'employee/rule.synthesize-requested',
          data: { tenantId, archetypeId, triggerRuleId: ruleId },
          id: `synthesis-${archetypeId}-${confirmedCount}`,
        });
        log.info({ archetypeId, confirmedCount }, 'Synthesis triggered after rule confirmation');
      }

      if (source === 'synthesis' && parentRuleIds.length > 0) {
        await Promise.all(parentRuleIds.map((id) => ruleRepo.patchArchive(id)));
        log.info({ ruleId, parentRuleIds }, 'Parent rules archived after synthesis confirmation');
      }
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to process rule_confirm');
      if (channel && messageTs) {
        try {
          await client.chat.update({
            channel,
            ts: messageTs,
            text: `✅ Rule confirmed by <@${user.id}>`,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `✅ Rule confirmed by <@${user.id}>` },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn(
            { ruleId, updateErr },
            'Failed to update Slack message after rule_confirm error (non-fatal)',
          );
        }
      }
    }
  });
}
