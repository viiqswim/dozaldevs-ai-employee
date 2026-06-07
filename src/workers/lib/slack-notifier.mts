import { createLogger } from '../../lib/logger.js';

const log = createLogger('slack-notifier');

export interface SlackNotifierOptions {
  roleName: string;
  slackToken?: string;
  slackChannel?: string;
  slackMsgTs?: string;
}

/**
 * Update the Slack "Received" notification to show failure state.
 * Non-fatal — never throws.
 */
export async function updateSlackNotificationToFailed(
  taskId: string,
  reason: string,
  options: SlackNotifierOptions,
): Promise<void> {
  const { slackToken, slackChannel, slackMsgTs, roleName } = options;
  if (!slackToken || !slackChannel || !slackMsgTs) {
    return;
  }
  try {
    const failureText = `❌ ${roleName} — Failed`;
    const slackBlocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${failureText}*${reason ? `\n${reason}` : ''}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
      },
    ];
    const slackRes = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slackToken}`,
      },
      body: JSON.stringify({
        channel: slackChannel,
        ts: slackMsgTs,
        text: failureText,
        blocks: slackBlocks,
      }),
    });
    if (!slackRes.ok) {
      log.warn(
        { taskId, status: slackRes.status },
        '[opencode-harness] Failed to update Slack notification on failure (non-fatal)',
      );
    }
  } catch (err) {
    log.warn(
      { err },
      '[opencode-harness] Failed to update Slack notification on failure (non-fatal)',
    );
  }
}
