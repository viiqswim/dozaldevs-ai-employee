import { describe, expect, it } from 'vitest';
import { buildApprovalBlocks } from '../../../src/workers/lib/approval-card-poster.mjs';
import type { ApprovalBlockData } from '../../../src/workers/lib/approval-card-poster.mjs';

const TASK_ID = 'test-task-id-1234';

describe('buildApprovalBlocks', () => {
  it('all fields provided (urgency=true) → returns blocks array with header, draft, context, actions, task-id context', () => {
    const data: ApprovalBlockData = {
      summary: 'Guest asked about parking availability',
      draft: 'Hi! We have parking available on site.',
      classification: 'NEEDS_APPROVAL',
      confidence: 0.92,
      urgency: true,
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThanOrEqual(4);

    const header = blocks[0];
    expect(header.type).toBe('header');
    expect((header as { type: string; text: { text: string } }).text.text).toContain('⚠️ ');
    expect((header as { type: string; text: { text: string } }).text.text).toContain(
      'Guest asked about parking availability',
    );
  });

  it('urgency=false → header uses 📝 prefix instead of ⚠️', () => {
    const data: ApprovalBlockData = {
      summary: 'Guest left a thank you message',
      classification: 'NEEDS_APPROVAL',
      urgency: false,
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const header = blocks[0];
    expect((header as { type: string; text: { text: string } }).text.text).toContain('📝 ');
    expect((header as { type: string; text: { text: string } }).text.text).not.toContain('⚠️ ');
  });

  it('urgency not provided → header uses 📝 prefix', () => {
    const data: ApprovalBlockData = {
      summary: 'Check-in question',
      classification: 'NEEDS_APPROVAL',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const header = blocks[0];
    expect((header as { type: string; text: { text: string } }).text.text).toContain('📝 ');
  });

  it('draft provided → includes a section block with draft text', () => {
    const data: ApprovalBlockData = {
      summary: 'Guest asked about WiFi password',
      draft: 'The WiFi password is GuestPass123',
      classification: 'NEEDS_APPROVAL',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const draftBlock = blocks.find(
      (b) =>
        b.type === 'section' &&
        typeof (b as { type: string; text?: { text: string } }).text?.text === 'string' &&
        (b as { type: string; text?: { text: string } }).text!.text.includes(
          'The WiFi password is GuestPass123',
        ),
    );
    expect(draftBlock).toBeDefined();
  });

  it('no draft → no section block with draft content', () => {
    const data: ApprovalBlockData = {
      summary: 'Thread resolved — no reply needed',
      classification: 'NO_ACTION_NEEDED',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const draftBlock = blocks.find(
      (b) =>
        b.type === 'section' &&
        (b as { type: string; text?: { text: string } }).text?.text?.includes('Draft response'),
    );
    expect(draftBlock).toBeUndefined();
  });

  it('NO_ACTION_NEEDED → classification badge shows ✅ NO_ACTION_NEEDED', () => {
    const data: ApprovalBlockData = {
      summary: 'No response needed',
      classification: 'NO_ACTION_NEEDED',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const contextBlock = blocks.find(
      (b) =>
        b.type === 'context' &&
        (b as { type: string; elements: { text: string }[] }).elements[0].text.includes(
          '✅ NO_ACTION_NEEDED',
        ),
    );
    expect(contextBlock).toBeDefined();
  });

  it('NEEDS_APPROVAL → classification badge shows 🔔 NEEDS_APPROVAL', () => {
    const data: ApprovalBlockData = {
      summary: 'Guest needs a response',
      classification: 'NEEDS_APPROVAL',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const contextBlock = blocks.find(
      (b) =>
        b.type === 'context' &&
        (b as { type: string; elements: { text: string }[] }).elements[0].text.includes(
          '🔔 NEEDS_APPROVAL',
        ),
    );
    expect(contextBlock).toBeDefined();
  });

  it('action_ids are approve_task, reject_task, edit_task', () => {
    const data: ApprovalBlockData = {
      summary: 'Guest message needs reply',
      classification: 'NEEDS_APPROVAL',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const actionsBlock = blocks.find((b) => b.type === 'actions') as {
      type: string;
      elements: { action_id: string }[];
    };

    expect(actionsBlock).toBeDefined();
    const actionIds = actionsBlock.elements.map((el) => el.action_id);
    expect(actionIds).toContain('approve_task');
    expect(actionIds).toContain('reject_task');
    expect(actionIds).toContain('edit_task');
  });

  it('task ID context block is always present as last block', () => {
    const data: ApprovalBlockData = {
      summary: 'Some summary',
      classification: 'NEEDS_APPROVAL',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const lastBlock = blocks[blocks.length - 1];
    expect(lastBlock.type).toBe('context');
    const lastContext = lastBlock as { type: string; elements: { text: string }[] };
    expect(lastContext.elements[0].text).toContain(TASK_ID);
  });

  it('taskId is set as value on all action buttons', () => {
    const data: ApprovalBlockData = {
      summary: 'Task to approve',
      classification: 'NEEDS_APPROVAL',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const actionsBlock = blocks.find((b) => b.type === 'actions') as {
      type: string;
      elements: { action_id: string; value: string }[];
    };

    for (const el of actionsBlock.elements) {
      expect(el.value).toBe(TASK_ID);
    }
  });

  it('summary longer than 150 chars is truncated in header', () => {
    const longSummary = 'A'.repeat(200);
    const data: ApprovalBlockData = {
      summary: longSummary,
      classification: 'NEEDS_APPROVAL',
      taskId: TASK_ID,
    };

    const blocks = buildApprovalBlocks(data);
    const header = blocks[0];
    const headerText = (header as { type: string; text: { text: string } }).text.text;
    expect(headerText.length).toBeLessThanOrEqual(155);
  });
});
