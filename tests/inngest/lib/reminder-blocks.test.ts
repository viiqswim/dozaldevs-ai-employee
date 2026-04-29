import { describe, it, expect } from 'vitest';
import {
  buildReminderBlocks,
  type ReminderThread,
} from '../../../src/inngest/lib/reminder-blocks.js';

const makeThread = (overrides: Partial<ReminderThread> = {}): ReminderThread => ({
  threadUid: 'thread-1',
  guestName: 'Alice Smith',
  propertyName: 'Beach House',
  elapsedMinutes: 45,
  permalink: 'https://slack.com/archives/C123/p1234567890',
  ...overrides,
});

describe('buildReminderBlocks', () => {
  it('uses singular "message" in header for 1 thread', () => {
    const blocks = buildReminderBlocks([makeThread()]);
    const header = blocks[0] as { type: string; text: { text: string } };
    expect(header.text.text).toBe('⏰ 1 unresponded message awaiting action');
  });

  it('uses plural "messages" in header for multiple threads', () => {
    const threads = [
      makeThread(),
      makeThread({ threadUid: 't2', guestName: 'Bob' }),
      makeThread({ threadUid: 't3', guestName: 'Carol' }),
    ];
    const blocks = buildReminderBlocks(threads);
    const header = blocks[0] as { type: string; text: { text: string } };
    expect(header.text.text).toBe('⏰ 3 unresponded messages awaiting action');
  });

  it('section text contains guest name, property name, and elapsed minutes', () => {
    const thread = makeThread({
      guestName: 'Jane Doe',
      propertyName: 'Mountain Cabin',
      elapsedMinutes: 90,
    });
    const blocks = buildReminderBlocks([thread]);
    const section = blocks[1] as { type: string; text: { type: string; text: string } };
    expect(section.text.text).toContain('Jane Doe');
    expect(section.text.text).toContain('Mountain Cabin');
    expect(section.text.text).toContain('90 min');
  });

  it('section text contains permalink as mrkdwn link', () => {
    const permalink = 'https://slack.com/archives/C999/p9876543210';
    const blocks = buildReminderBlocks([makeThread({ permalink })]);
    const section = blocks[1] as { type: string; text: { type: string; text: string } };
    expect(section.text.text).toContain(`<${permalink}|View message>`);
  });

  it('all guest names are present in blocks for multiple threads', () => {
    const threads = [
      makeThread({ threadUid: 't1', guestName: 'Alice' }),
      makeThread({ threadUid: 't2', guestName: 'Bob' }),
      makeThread({ threadUid: 't3', guestName: 'Carol' }),
    ];
    const blocks = buildReminderBlocks(threads);
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('Alice');
    expect(allText).toContain('Bob');
    expect(allText).toContain('Carol');
  });

  it('dividers appear between sections but not before first or after last section', () => {
    const threads = [
      makeThread({ threadUid: 't1' }),
      makeThread({ threadUid: 't2', guestName: 'Bob' }),
      makeThread({ threadUid: 't3', guestName: 'Carol' }),
    ];
    const blocks = buildReminderBlocks(threads);
    const dividers = blocks.filter((b) => (b as { type: string }).type === 'divider');
    expect(dividers).toHaveLength(2);

    const secondBlock = blocks[1] as { type: string };
    expect(secondBlock.type).toBe('section');

    const lastBlock = blocks[blocks.length - 1] as { type: string };
    expect(lastBlock.type).toBe('context');

    const secondToLast = blocks[blocks.length - 2] as { type: string };
    expect(secondToLast.type).not.toBe('divider');
  });

  it('context block is always the last block', () => {
    const blocks = buildReminderBlocks([makeThread()]);
    const last = blocks[blocks.length - 1] as {
      type: string;
      elements: Array<{ type: string; text: string }>;
    };
    expect(last.type).toBe('context');
    expect(last.elements[0].text).toContain('AI Employee Platform');
  });

  it('empty threads array returns header + context block without crashing', () => {
    const blocks = buildReminderBlocks([]);
    expect(blocks).toHaveLength(2);
    const header = blocks[0] as { type: string; text: { text: string } };
    expect(header.type).toBe('header');
    expect(header.text.text).toBe('⏰ 0 unresponded messages awaiting action');
    const context = blocks[1] as { type: string };
    expect(context.type).toBe('context');
  });
});
