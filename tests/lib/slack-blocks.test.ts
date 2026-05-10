import { describe, it, expect } from 'vitest';
import {
  buildSupersededBlocks,
  buildEnrichedNotifyBlocks,
  buildNotifyStateBlocks,
  buildNoActionThreadBlocks,
  buildOverrideCardBlocks,
} from '../../src/lib/slack-blocks.js';

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
