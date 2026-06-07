import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import { createLogger } from '../../../lib/logger.js';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import {
  type ActionBody,
  BUTTON_BLOCKS,
  isTaskAwaitingApproval,
  isTaskAwaitingOverride,
  getTaskStatusMessage,
} from './shared.js';

const log = createLogger('slack-handlers');

export function registerApprovalHandlers(boltApp: App, inngest: InngestLike): void {
  boltApp.action(SLACK_ACTION_ID.APPROVE, async ({ ack, body, respond }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channelId = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (!taskId) {
      await ack();
      log.warn('approve action received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: '⏳ Got it — sending this for approval…',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '⏳ Got it — sending this for approval…' },
        },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'approve action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate approve');
        try {
          const statusMsg = await getTaskStatusMessage(taskId);
          await respond({
            replace_original: true,
            text: statusMsg,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: statusMsg } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (respondErr) {
          log.warn({ taskId, respondErr }, 'Failed to update already-processed message');
        }
        return;
      }

      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'approve', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Approval event sent — lifecycle will update message');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process approve action');
      try {
        await respond({
          replace_original: true,
          text: 'Hmm, something went wrong on my end — mind trying that again?',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Hmm, something went wrong on my end — mind trying that again?',
              },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ...BUTTON_BLOCKS(taskId),
          ],
        });
      } catch (restoreErr) {
        log.warn({ taskId, err: restoreErr }, 'Failed to restore buttons after approve failure');
      }
    }
  });

  boltApp.action(SLACK_ACTION_ID.REJECT, async ({ ack, body, respond }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channelId = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;

    if (!taskId) {
      await ack();
      log.warn('reject action received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: '⏳ Got it — noting your rejection…',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '⏳ Got it — noting your rejection…' } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    log.info(
      { taskId, channelId, messageTs, userId: user.id },
      'reject action received — processing state sent inline with ack',
    );

    try {
      const stillAwaiting = await isTaskAwaitingApproval(taskId, {
        maxRetries: 10,
        retryDelayMs: 2000,
      });
      if (!stillAwaiting) {
        log.warn({ taskId }, 'Task no longer awaiting approval — ignoring duplicate reject');
        try {
          const statusMsg = await getTaskStatusMessage(taskId);
          await respond({
            replace_original: true,
            text: statusMsg,
            blocks: [
              { type: 'section', text: { type: 'mrkdwn', text: statusMsg } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (respondErr) {
          log.warn({ taskId, respondErr }, 'Failed to update already-processed message');
        }
        return;
      }

      await inngest.send({
        name: 'employee/approval.received',
        data: { taskId, action: 'reject', userId: user.id, userName: user.name },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Rejection event sent — lifecycle will update message');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process reject action');
      try {
        await respond({
          replace_original: true,
          text: 'Hmm, something went wrong on my end — mind trying that again?',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Hmm, something went wrong on my end — mind trying that again?',
              },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ...BUTTON_BLOCKS(taskId),
          ],
        });
      } catch (restoreErr) {
        log.warn({ taskId, err: restoreErr }, 'Failed to restore buttons after reject failure');
      }
    }
  });

  boltApp.action(SLACK_ACTION_ID.OVERRIDE_TAKE_ACTION, async ({ ack, body, client }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value ?? '';

    if (!taskId) {
      await ack();
      log.warn('override_take_action received without task_id');
      return;
    }

    await ack();

    const channelId = actionBody.channel?.id ?? '';
    const messageTs = actionBody.message?.ts ?? '';

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: 'On it — one moment…',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: 'On it — one moment…' } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { taskId, updateErr },
          'Failed to remove buttons before override_take_action modal (non-fatal)',
        );
      }
    }

    try {
      await client.views.open({
        trigger_id: (body as { trigger_id: string }).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'override_take_action_modal',
          private_metadata: JSON.stringify({ taskId, channelId, messageTs }),
          title: { type: 'plain_text', text: 'Provide Direction' },
          submit: { type: 'plain_text', text: 'Submit' },
          close: { type: 'plain_text', text: 'Cancel' },
          blocks: [
            {
              type: 'input',
              block_id: 'direction_input',
              label: { type: 'plain_text', text: 'What should the AI do?' },
              element: {
                type: 'plain_text_input',
                action_id: 'direction_text',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Describe the action you want the AI to take...',
                },
              },
            },
          ],
        },
      });
      log.info({ taskId }, 'override_take_action modal opened');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to open override_take_action modal');
    }
  });

  boltApp.action(SLACK_ACTION_ID.OVERRIDE_DISMISS, async ({ ack, body }) => {
    const actionBody = body as ActionBody;
    const taskId = actionBody.actions[0]?.value ?? '';
    const user = actionBody.user;

    if (!taskId) {
      await ack();
      log.warn('override_dismiss received without task_id');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ack as any)({
      replace_original: true,
      text: `✅ Dismissed by <@${user.id}>`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `✅ Dismissed by <@${user.id}>` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ],
    });

    try {
      await inngest.send({
        name: 'employee/override.requested',
        data: { taskId, direction: null, userId: user.id, userName: user.name },
        id: `employee-override-dismiss-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Override dismiss event sent');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send override dismiss event');
    }
  });

  boltApp.view('override_take_action_modal', async ({ ack, view, body, client }) => {
    const direction = view.state.values?.direction_input?.direction_text?.value ?? '';

    if (!direction || !direction.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ack as any)({
        response_action: 'errors',
        errors: { direction_input: 'Direction cannot be empty.' },
      });
      return;
    }

    await ack();

    let taskId = '';
    let channelId = '';
    let messageTs = '';
    try {
      const meta = JSON.parse(view.private_metadata ?? '{}') as {
        taskId?: string;
        channelId?: string;
        messageTs?: string;
      };
      taskId = meta.taskId ?? '';
      channelId = meta.channelId ?? '';
      messageTs = meta.messageTs ?? '';
    } catch {
      log.error('Failed to parse override_take_action_modal private_metadata');
      return;
    }

    if (!taskId) {
      log.error('override_take_action_modal submitted without taskId in private_metadata');
      return;
    }

    if (channelId && messageTs) {
      try {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          text: '⏳ On it — working on your direction…',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '⏳ On it — working on your direction…' },
            },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ],
        });
      } catch (updateErr) {
        log.warn(
          { taskId, updateErr },
          'Failed to remove buttons before override_take_action_modal work (non-fatal)',
        );
      }
    }

    const stillAwaiting = await isTaskAwaitingOverride(taskId);
    if (!stillAwaiting) {
      log.warn({ taskId }, 'Task already resolved — ignoring duplicate override submission');
      return;
    }

    const user = body.user;

    try {
      await inngest.send({
        name: 'employee/override.requested',
        data: { taskId, direction: direction.trim(), userId: user.id, userName: user.name },
        id: `employee-override-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Override take-action event sent');

      if (channelId && messageTs) {
        try {
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            text: '⏳ On it — working on your direction…',
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: '⏳ On it — working on your direction…' },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          });
        } catch (updateErr) {
          log.warn(
            { taskId, updateErr },
            'Failed to update message after override submit (non-fatal)',
          );
        }
      }
    } catch (err) {
      log.error({ taskId, err }, 'Failed to process override_take_action_modal submission');
    }
  });
}
