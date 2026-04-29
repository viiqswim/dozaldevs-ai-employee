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
