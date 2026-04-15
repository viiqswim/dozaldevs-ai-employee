import type { App } from '@slack/bolt';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('slack-handlers');

interface InngestLike {
  send(event: {
    name: string;
    data: Record<string, unknown>;
    id?: string;
  }): Promise<{ ids: string[] }>;
}

export function registerSlackHandlers(boltApp: App, inngest: InngestLike): void {
  boltApp.action('approve', async ({ ack, body }) => {
    await ack();

    const action = (body as { actions: Array<{ value: string }> }).actions[0];
    const taskId = action?.value;
    const user = (body as { user: { id: string; name: string } }).user;

    if (!taskId) {
      log.warn('approve action received without task_id');
      return;
    }

    try {
      await inngest.send({
        name: 'employee/approval.received',
        data: {
          taskId,
          action: 'approve',
          userId: user.id,
          userName: user.name,
        },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Approval event sent');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send approval event');
    }
  });

  boltApp.action('reject', async ({ ack, body }) => {
    await ack();

    const action = (body as { actions: Array<{ value: string }> }).actions[0];
    const taskId = action?.value;
    const user = (body as { user: { id: string; name: string } }).user;

    if (!taskId) {
      log.warn('reject action received without task_id');
      return;
    }

    try {
      await inngest.send({
        name: 'employee/approval.received',
        data: {
          taskId,
          action: 'reject',
          userId: user.id,
          userName: user.name,
        },
        id: `employee-approval-${taskId}`,
      });
      log.info({ taskId, userId: user.id }, 'Rejection event sent');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send rejection event');
    }
  });
}
