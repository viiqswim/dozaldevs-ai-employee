import { describe, it, expect } from 'vitest';
import {
  buildSupersededBlocks,
  buildEnrichedNotifyBlocks,
  buildNotifyStateBlocks,
  buildNoActionThreadBlocks,
  buildOverrideCardBlocks,
  buildEnrichedTerminalBlocks,
  buildContextThreadBlocks,
  buildCompactNotifyBlocks,
} from '../../src/lib/slack-blocks.js';
import { buildHostfullyLink } from '../../src/lib/enrichment-adapters/hostfully.js';

type Block = {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text?: string; action_id?: string; value?: string }>;
};

describe('buildSupersededBlocks', () => {
  it('returns an array of blocks', () => {
    const blocks = buildSupersededBlocks('task-sup-001');
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('contains no actions block — buttons are removed in superseded state', () => {
    const blocks = buildSupersededBlocks('task-sup-002');
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions');
    expect(actionsBlock).toBeUndefined();
  });

  it('contains a section block', () => {
    const blocks = buildSupersededBlocks('task-sup-003');
    const sectionBlock = blocks.find((b) => (b as { type: string }).type === 'section');
    expect(sectionBlock).toBeDefined();
  });

  it('section text includes the word "Superseded"', () => {
    const blocks = buildSupersededBlocks('task-sup-004');
    const sectionBlock = blocks.find((b) => (b as { type: string }).type === 'section') as
      | { type: string; text: { text: string } }
      | undefined;
    expect(sectionBlock).toBeDefined();
    expect(sectionBlock!.text.text).toContain('Superseded');
  });

  it('section text includes the superseded emoji ⏭️', () => {
    const blocks = buildSupersededBlocks('task-sup-005');
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('⏭️');
  });

  it('section text mentions that the response was not sent', () => {
    const blocks = buildSupersededBlocks('task-sup-006');
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('not sent');
  });

  it('returns a new array on each call (no shared state)', () => {
    const blocks1 = buildSupersededBlocks('task-sup-007');
    const blocks2 = buildSupersededBlocks('task-sup-007');
    expect(blocks1).not.toBe(blocks2);
  });

  it('includes task ID in context block', () => {
    const blocks = buildSupersededBlocks('task-sup-008');
    const contextBlock = blocks.find((b) => (b as { type: string }).type === 'context');
    expect(contextBlock).toBeDefined();
    expect(JSON.stringify(contextBlock)).toContain('task-sup-008');
  });
});

describe('buildEnrichedNotifyBlocks', () => {
  it('includes all fields when full data is provided', () => {
    const blocks = buildEnrichedNotifyBlocks({
      guestName: 'Alice',
      propertyName: 'Beach House',
      bookingChannel: 'Airbnb',
      checkIn: '2026-06-01',
      checkOut: '2026-06-07',
      messageSnippet: 'Is the pool heated?',
      taskId: 'task-001',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('Alice');
    expect(allText).toContain('Beach House');
    expect(allText).toContain('Airbnb');
    expect(allText).toContain('2026-06-01');
    expect(allText).toContain('2026-06-07');
    expect(allText).toContain('Is the pool heated?');
    expect(allText).toContain('task-001');
  });

  it('handles minimal data (only guestName + taskId) without subtitle or snippet', () => {
    const blocks = buildEnrichedNotifyBlocks({ guestName: 'Bob', taskId: 'task-002' });
    const sectionBlock = (blocks as Block[]).find((b) => b.type === 'section');
    expect(sectionBlock).toBeDefined();
    const text = sectionBlock!.text!.text;
    expect(text).toContain('Bob');
    expect(text).not.toContain('_');
    expect(text).not.toContain('>');
  });

  it('truncates message snippet longer than 120 chars with "..."', () => {
    const longSnippet = 'A'.repeat(121);
    const blocks = buildEnrichedNotifyBlocks({
      guestName: 'Carol',
      taskId: 'task-003',
      messageSnippet: longSnippet,
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('...');
    expect(allText).not.toContain('A'.repeat(121));
  });

  it('does NOT truncate message snippet of exactly 120 chars', () => {
    const exactSnippet = 'B'.repeat(120);
    const blocks = buildEnrichedNotifyBlocks({
      guestName: 'Dave',
      taskId: 'task-004',
      messageSnippet: exactSnippet,
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('B'.repeat(120));
    expect(allText).not.toContain('...');
  });

  it('context block contains taskId', () => {
    const blocks = buildEnrichedNotifyBlocks({ guestName: 'Eve', taskId: 'task-005' });
    const contextBlock = (blocks as Block[]).find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const contextText = JSON.stringify(contextBlock);
    expect(contextText).toContain('task-005');
  });
});

describe('buildNotifyStateBlocks', () => {
  it('returns section block with emoji and bold text', () => {
    const blocks = buildNotifyStateBlocks({ emoji: '✅', text: 'Done', taskId: 'task-010' });
    const sectionBlock = (blocks as Block[]).find((b) => b.type === 'section');
    expect(sectionBlock).toBeDefined();
    expect(sectionBlock!.text!.text).toBe('✅ *Done*');
  });

  it('returns context block containing taskId', () => {
    const blocks = buildNotifyStateBlocks({ emoji: '⏳', text: 'Processing', taskId: 'task-011' });
    const contextBlock = (blocks as Block[]).find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    expect(JSON.stringify(contextBlock)).toContain('task-011');
  });
});

describe('buildNoActionThreadBlocks', () => {
  it('includes all UIDs in context when propertyUid and leadUid are provided', () => {
    const blocks = buildNoActionThreadBlocks({
      reasoning: 'Host already replied.',
      taskId: 'task-020',
      propertyUid: 'prop-abc',
      leadUid: 'lead-xyz',
    });
    const contextBlock = (blocks as Block[]).find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const contextText = JSON.stringify(contextBlock);
    expect(contextText).toContain('prop-abc');
    expect(contextText).toContain('lead-xyz');
    expect(contextText).toContain('task-020');
  });

  it('context contains only taskId when propertyUid and leadUid are omitted', () => {
    const blocks = buildNoActionThreadBlocks({ reasoning: 'No messages.', taskId: 'task-021' });
    const contextBlock = (blocks as Block[]).find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const contextText = JSON.stringify(contextBlock);
    expect(contextText).toContain('task-021');
    expect(contextText).not.toContain('Property');
    expect(contextText).not.toContain('Lead');
  });
});

describe('buildOverrideCardBlocks', () => {
  it('action buttons have correct action_ids', () => {
    const blocks = buildOverrideCardBlocks({
      reasoning: 'Low confidence.',
      taskId: 'task-030',
      roleName: 'guest-messaging',
    });
    const actionsBlock = (blocks as Block[]).find((b) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    const actionIds = actionsBlock!.elements!.map((e) => e.action_id);
    expect(actionIds).toContain('override_take_action');
    expect(actionIds).toContain('override_dismiss');
  });

  it('button values contain taskId', () => {
    const blocks = buildOverrideCardBlocks({
      reasoning: 'Low confidence.',
      taskId: 'task-031',
      roleName: 'guest-messaging',
    });
    const actionsBlock = (blocks as Block[]).find((b) => b.type === 'actions');
    const values = actionsBlock!.elements!.map((e) => e.value);
    expect(values).toContain('task-031');
  });

  it('reasoning text is included in section block', () => {
    const blocks = buildOverrideCardBlocks({
      reasoning: 'Guest already checked out.',
      taskId: 'task-032',
      roleName: 'guest-messaging',
    });
    const sectionBlock = (blocks as Block[]).find((b) => b.type === 'section');
    expect(sectionBlock).toBeDefined();
    expect(sectionBlock!.text!.text).toContain('Guest already checked out.');
  });

  it('includes displayContext key/value pairs in context block when provided', () => {
    const blocks = buildOverrideCardBlocks({
      reasoning: 'Reason.',
      taskId: 'task-033',
      roleName: 'guest-messaging',
      displayContext: { Property: 'Beach House', Guest: 'Alice' },
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('Beach House');
    expect(allText).toContain('Alice');
  });

  it('does NOT include extra displayContext block when displayContext is omitted', () => {
    const blocks = buildOverrideCardBlocks({
      reasoning: 'Reason.',
      taskId: 'task-034',
      roleName: 'guest-messaging',
    });
    const contextBlocks = (blocks as Block[]).filter((b) => b.type === 'context');
    expect(contextBlocks.length).toBe(1);
  });
});

describe('buildHostfullyLink', () => {
  it('returns correctly formatted Hostfully inbox URL', () => {
    const url = buildHostfullyLink('thread-123', 'lead-456');
    expect(url).toBe(
      'https://platform.hostfully.com/app/#/inbox?threadUid=thread-123&leadUid=lead-456',
    );
  });
});

describe('buildEnrichedTerminalBlocks', () => {
  const FIXED_EPOCH = 1746806400;

  it('status done with all fields contains actor mention, guest name, property, hostfully link, date, task ID', () => {
    const blocks = buildEnrichedTerminalBlocks({
      status: 'done',
      actorUserId: 'U123',
      guestName: 'Tiffany White',
      propertyName: 'Ocean View Suite',
      threadUid: 'thread-123',
      leadUid: 'lead-456',
      sentSnippet: 'Thank you for your inquiry!',
      taskId: 'test-task-id',
      timestamp: FIXED_EPOCH,
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('<@U123>');
    expect(allText).toContain('Tiffany White');
    expect(allText).toContain('Ocean View Suite');
    expect(allText).toContain('hostfully.com');
    expect(allText).toContain('<!date^');
    expect(allText).toContain('test-task-id');
  });

  it('status done with minimal fields does not throw and includes task ID context block', () => {
    const blocks = buildEnrichedTerminalBlocks({
      status: 'done',
      taskId: 'minimal-task-id',
    });
    expect(Array.isArray(blocks)).toBe(true);
    expect(JSON.stringify(blocks)).toContain('minimal-task-id');
  });

  it('status rejected contains rejection indicator and actor mention', () => {
    const blocks = buildEnrichedTerminalBlocks({
      status: 'rejected',
      actorUserId: 'U456',
      taskId: 'task-rej-001',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('❌');
    expect(allText).toContain('<@U456>');
    expect(allText).toContain('task-rej-001');
  });

  it('status failed contains task failed text', () => {
    const blocks = buildEnrichedTerminalBlocks({
      status: 'failed',
      taskId: 'task-fail-001',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('❌ *Task failed*');
    expect(allText).toContain('task-fail-001');
  });

  it('status expired contains expired indicator', () => {
    const blocks = buildEnrichedTerminalBlocks({
      status: 'expired',
      taskId: 'task-exp-001',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('⏰');
    expect(allText).toContain('task-exp-001');
  });

  it('status delivery_failed contains delivery failed text', () => {
    const blocks = buildEnrichedTerminalBlocks({
      status: 'delivery_failed',
      taskId: 'task-df-001',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('❌ *Delivery failed');
    expect(allText).toContain('task-df-001');
  });
});

describe('buildContextThreadBlocks', () => {
  it('action approve with sentResponse contains sent response section and quoted original message', () => {
    const blocks = buildContextThreadBlocks({
      action: 'approve',
      sentResponse: 'Thank you for your inquiry!',
      originalMessage: 'Is the pool heated?',
      taskId: 'task-ctx-001',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('📤 Response sent to guest');
    expect(allText).toContain('>Thank you for your inquiry!');
    expect(allText).toContain('>Is the pool heated?');
    expect(allText).toContain('task-ctx-001');
  });

  it('action edit with draftResponse and editedResponse contains both sections', () => {
    const blocks = buildContextThreadBlocks({
      action: 'edit',
      draftResponse: 'AI draft here.',
      editedResponse: 'Edited by PM.',
      taskId: 'task-ctx-002',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('🤖 Original AI draft');
    expect(allText).toContain('✏️ Edited response');
    expect(allText).toContain('>AI draft here.');
    expect(allText).toContain('>Edited by PM.');
    expect(allText).toContain('task-ctx-002');
  });

  it('action reject with draftResponse contains not-sent draft section', () => {
    const blocks = buildContextThreadBlocks({
      action: 'reject',
      draftResponse: 'Rejected AI response.',
      taskId: 'task-ctx-003',
    });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('🤖 AI suggested response (not sent)');
    expect(allText).toContain('>Rejected AI response.');
    expect(allText).toContain('task-ctx-003');
  });

  it('with no optional fields does not throw and includes header section and task ID', () => {
    const blocks = buildContextThreadBlocks({
      action: 'approve',
      taskId: 'task-ctx-004',
    });
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('Message Context');
    expect(allText).toContain('task-ctx-004');
  });
});

describe('buildCompactNotifyBlocks', () => {
  type Block = { type: string; text?: { type: string; text: string }; elements?: unknown[] };

  const FULL_PARAMS = {
    guestName: 'Olivia',
    propertyName: 'Beach House',
    threadUid: 'thread-abc',
    leadUid: 'lead-xyz',
    taskId: 'task-compact-001',
  } as const;

  it('always returns exactly 2 blocks', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'processing', taskId: 'task-c-001' });
    expect(blocks).toHaveLength(2);
  });

  it('first block is a section with mrkdwn text', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'processing', taskId: 'task-c-002' });
    const section = (blocks as Block[])[0];
    expect(section.type).toBe('section');
    expect(section.text?.type).toBe('mrkdwn');
    expect(typeof section.text?.text).toBe('string');
  });

  it('second block is a context block with task ID', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'processing', taskId: 'task-c-003' });
    const context = (blocks as Block[])[1];
    expect(context.type).toBe('context');
    expect(JSON.stringify(context)).toContain('task-c-003');
  });

  it('main text is fully bold (wrapped in *…*)', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'processing', taskId: 'task-c-004' });
    const text = (blocks as Block[])[0].text?.text ?? '';
    expect(text.startsWith('*')).toBe(true);
    expect(text.endsWith('*')).toBe(true);
  });

  it('status processing → ⏳ … Processing', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'processing', ...FULL_PARAMS });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('⏳');
    expect(text).toContain('Processing');
  });

  it('status reviewing → ⏳ … Awaiting approval', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'reviewing', ...FULL_PARAMS });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('⏳');
    expect(text).toContain('Awaiting approval');
  });

  it('status done → ✅ … Reply sent · <@actorUserId>', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'done',
      actorUserId: 'U999',
      ...FULL_PARAMS,
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('✅');
    expect(text).toContain('Reply sent');
    expect(text).toContain('<@U999>');
  });

  it('status rejected → ❌ … Rejected · <@actorUserId>', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'rejected',
      actorUserId: 'U888',
      ...FULL_PARAMS,
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('❌');
    expect(text).toContain('Rejected');
    expect(text).toContain('<@U888>');
  });

  it('status failed → ❌ … Failed', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'failed', ...FULL_PARAMS });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('❌');
    expect(text).toContain('Failed');
  });

  it('status expired → ⏰ … Expired', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'expired', ...FULL_PARAMS });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('⏰');
    expect(text).toContain('Expired');
  });

  it('status delivery_failed → ❌ … Delivery failed', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'delivery_failed', ...FULL_PARAMS });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('❌');
    expect(text).toContain('Delivery failed');
  });

  it('status no_action → ✅ … No action needed', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'no_action', ...FULL_PARAMS });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('✅');
    expect(text).toContain('No action needed');
  });

  it('status superseded → ⏭️ … Superseded', () => {
    const blocks = buildCompactNotifyBlocks({ status: 'superseded', ...FULL_PARAMS });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('⏭️');
    expect(text).toContain('Superseded');
  });

  it('includes Hostfully link when both threadUid and leadUid are provided', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'processing',
      threadUid: 'thread-abc',
      leadUid: 'lead-xyz',
      taskId: 'task-c-link-01',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('https://platform.hostfully.com');
    expect(text).toContain('🔗 View');
  });

  it('omits Hostfully link when threadUid is missing', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'processing',
      leadUid: 'lead-xyz',
      taskId: 'task-c-link-02',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).not.toContain('hostfully.com');
  });

  it('omits Hostfully link when leadUid is missing', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'processing',
      threadUid: 'thread-abc',
      taskId: 'task-c-link-03',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).not.toContain('hostfully.com');
  });

  it('includes guestName and propertyName in identity when both provided', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'processing',
      guestName: 'Olivia',
      propertyName: 'Beach House',
      taskId: 'task-c-id-01',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('Olivia');
    expect(text).toContain('Beach House');
    expect(text).toContain('Olivia · Beach House');
  });

  it('gracefully handles missing guestName — only propertyName shown in identity', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'processing',
      propertyName: 'Beach House',
      taskId: 'task-c-id-02',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('Beach House');
    expect(text).not.toContain(' · Beach House');
  });

  it('gracefully handles missing propertyName — only guestName shown in identity', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'processing',
      guestName: 'Olivia',
      taskId: 'task-c-id-03',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('Olivia');
    expect(text).not.toContain('Olivia · ');
  });

  it('gracefully handles missing guestName and propertyName — text starts with emoji directly', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'processing',
      taskId: 'task-c-id-04',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).not.toContain(' — ');
    expect(text).toContain('⏳');
    expect(text).toContain('Processing');
  });

  it('full params produce correct combined text with identity, status, and link', () => {
    const blocks = buildCompactNotifyBlocks({
      status: 'done',
      guestName: 'Olivia',
      propertyName: 'Beach House',
      actorUserId: 'U123',
      threadUid: 'thread-abc',
      leadUid: 'lead-xyz',
      taskId: 'task-c-full-01',
    });
    const text = (blocks as Block[])[0].text!.text;
    expect(text).toContain('Olivia');
    expect(text).toContain('Beach House');
    expect(text).toContain('Reply sent');
    expect(text).toContain('<@U123>');
    expect(text).toContain('hostfully.com');
    expect(JSON.stringify(blocks)).toContain('task-c-full-01');
  });
});
