export interface ReminderThread {
  threadUid: string;
  guestName: string;
  propertyName: string;
  elapsedMinutes: number;
  permalink: string;
}

export function buildReminderBlocks(threads: ReminderThread[]): unknown[] {
  const blocks: unknown[] = [];

  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `⏰ ${threads.length} unresponded message${threads.length === 1 ? '' : 's'} awaiting action`,
      emoji: true,
    },
  });

  threads.forEach((thread, index) => {
    if (index > 0) {
      blocks.push({ type: 'divider' });
    }
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${thread.guestName}* — ${thread.propertyName}\n⏱️ Waiting ${thread.elapsedMinutes} min · <${thread.permalink}|View message>`,
      },
    });
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '⚡ Unresponded message alert — AI Employee Platform',
      },
    ],
  });

  return blocks;
}
