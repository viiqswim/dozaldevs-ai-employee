import { describe, it, expect, vi } from 'vitest';

const { origArgv } = vi.hoisted(() => {
  const origArgv = [...process.argv];
  process.argv = [
    'node',
    'post-guest-approval.ts',
    '--channel',
    'C-TEST',
    '--task-id',
    'test-task-id',
    '--guest-name',
    'Test Guest',
    '--property-name',
    'Test Property',
    '--check-in',
    '2026-01-01',
    '--check-out',
    '2026-01-05',
    '--booking-channel',
    'AIRBNB',
    '--original-message',
    'Test message',
    '--draft-response',
    'Test response',
    '--confidence',
    '0.9',
    '--category',
    'test',
    '--lead-uid',
    'lead-test',
    '--thread-uid',
    'thread-test',
    '--message-uid',
    'msg-test',
    '--dry-run',
  ];
  return { origArgv };
});

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
  })),
}));

import { buildGuestApprovalBlocks } from '../../../src/worker-tools/slack/post-guest-approval.js';

const baseParams = {
  channel: 'C123',
  taskId: 'task-uuid-123',
  guestName: 'John Doe',
  propertyName: '3505 Bandera',
  checkIn: '2026-05-01',
  checkOut: '2026-05-05',
  bookingChannel: 'AIRBNB',
  originalMessage: 'What time is check-in?',
  draftResponse: 'Check-in is at 3pm.',
  confidence: 0.92,
  category: 'access',
  leadUid: 'lead-abc',
  threadUid: 'thread-def',
  messageUid: 'msg-ghi',
  urgency: false,
  dryRun: true,
};

describe('buildGuestApprovalBlocks', () => {
  // ─── 1. Block count ───────────────────────────────────────────────────────

  it('returns at least 8 blocks', () => {
    const blocks = buildGuestApprovalBlocks(baseParams);
    expect(blocks.length).toBeGreaterThanOrEqual(8);
  });

  // ─── 2. Action IDs present ────────────────────────────────────────────────

  it('contains all 3 action IDs: guest_approve, guest_edit, guest_reject', () => {
    const blocks = buildGuestApprovalBlocks(baseParams);
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: Array<{ action_id: string }> }
      | undefined;

    expect(actionsBlock).toBeDefined();
    const actionIds = actionsBlock!.elements.map((e) => e.action_id);
    expect(actionIds).toContain('guest_approve');
    expect(actionIds).toContain('guest_edit');
    expect(actionIds).toContain('guest_reject');
  });

  // ─── 3. Context block with task ID ────────────────────────────────────────

  it('contains task ID in context block', () => {
    const blocks = buildGuestApprovalBlocks(baseParams);
    const contextBlock = blocks.find((b) => (b as { type: string }).type === 'context') as
      | { elements: Array<{ text: string }> }
      | undefined;

    expect(contextBlock).toBeDefined();
    const contextText = contextBlock!.elements[0]?.text ?? '';
    expect(contextText).toContain('task-uuid-123');
  });

  // ─── 4. Edit button value is valid JSON with taskId and draftResponse ─────

  it('Edit button value is valid JSON with taskId and draftResponse', () => {
    const blocks = buildGuestApprovalBlocks(baseParams);
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: Array<{ action_id: string; value: string }> }
      | undefined;

    const editButton = actionsBlock!.elements.find((e) => e.action_id === 'guest_edit');
    expect(editButton).toBeDefined();

    const parsed = JSON.parse(editButton!.value) as { taskId: string; draftResponse: string };
    expect(parsed.taskId).toBe('task-uuid-123');
    expect(parsed.draftResponse).toBe('Check-in is at 3pm.');
  });

  // ─── 5. Edit button value does not exceed 2000 chars for long draft ───────

  it('Edit button value does not exceed 2000 chars for a very long draft', () => {
    const longDraft = 'x'.repeat(3000);
    const blocks = buildGuestApprovalBlocks({ ...baseParams, draftResponse: longDraft });
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: Array<{ action_id: string; value: string }> }
      | undefined;

    const editButton = actionsBlock!.elements.find((e) => e.action_id === 'guest_edit');
    expect(editButton).toBeDefined();
    expect(editButton!.value.length).toBeLessThanOrEqual(2000);
  });

  // ─── 6. conversationSummary block added when present ──────────────────────

  it('adds conversationSummary block when provided', () => {
    const blocks = buildGuestApprovalBlocks({
      ...baseParams,
      conversationSummary: 'Guest has been asking about check-in times.',
    });
    const textBlocks = blocks.filter(
      (b) =>
        (b as { type: string }).type === 'section' &&
        JSON.stringify(b).includes('Conversation Summary'),
    );
    expect(textBlocks.length).toBeGreaterThan(0);
  });

  // ─── 7. Missing conversationSummary — no summary block ───────────────────

  it('handles missing conversationSummary gracefully — no Conversation Summary block', () => {
    const { conversationSummary: _cs, ...paramsWithoutSummary } =
      baseParams as typeof baseParams & {
        conversationSummary?: string;
      };
    const blocks = buildGuestApprovalBlocks({
      ...paramsWithoutSummary,
      conversationSummary: undefined,
    });
    const summaryBlocks = blocks.filter((b) => JSON.stringify(b).includes('Conversation Summary'));
    expect(summaryBlocks.length).toBe(0);
  });

  // ─── 8. Urgency flag — :warning: in header ────────────────────────────────

  it('uses warning emoji in header when urgency is true', () => {
    const blocks = buildGuestApprovalBlocks({ ...baseParams, urgency: true });
    const headerBlock = blocks[0] as {
      type: string;
      text: { text: string };
    };
    expect(headerBlock.type).toBe('header');
    expect(headerBlock.text.text).toContain(':warning:');
  });

  it('uses rotating_light emoji in header when urgency is false', () => {
    const blocks = buildGuestApprovalBlocks({ ...baseParams, urgency: false });
    const headerBlock = blocks[0] as {
      type: string;
      text: { text: string };
    };
    expect(headerBlock.type).toBe('header');
    expect(headerBlock.text.text).toContain(':rotating_light:');
  });

  // ─── 9. Confidence shown as percentage ────────────────────────────────────

  it('shows confidence as percentage in a section block', () => {
    const blocks = buildGuestApprovalBlocks({ ...baseParams, confidence: 0.92 });
    const confidenceBlock = blocks.find(
      (b) => (b as { type: string }).type === 'section' && JSON.stringify(b).includes('92%'),
    );
    expect(confidenceBlock).toBeDefined();
  });

  // ─── 10. Guest and property info present ─────────────────────────────────

  it('includes guestName, propertyName, checkIn, checkOut, bookingChannel in section fields', () => {
    const blocks = buildGuestApprovalBlocks(baseParams);
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('John Doe');
    expect(allText).toContain('3505 Bandera');
    expect(allText).toContain('2026-05-01');
    expect(allText).toContain('2026-05-05');
    expect(allText).toContain('AIRBNB');
  });

  // ─── 11. approve button value is plain taskId ─────────────────────────────

  it('Approve button value is the plain taskId string', () => {
    const blocks = buildGuestApprovalBlocks(baseParams);
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: Array<{ action_id: string; value: string }> }
      | undefined;

    const approveButton = actionsBlock!.elements.find((e) => e.action_id === 'guest_approve');
    expect(approveButton).toBeDefined();
    expect(approveButton!.value).toBe('task-uuid-123');
  });

  // ─── 12. reject button value is plain taskId ─────────────────────────────

  it('Reject button value is the plain taskId string', () => {
    const blocks = buildGuestApprovalBlocks(baseParams);
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: Array<{ action_id: string; value: string }> }
      | undefined;

    const rejectButton = actionsBlock!.elements.find((e) => e.action_id === 'guest_reject');
    expect(rejectButton).toBeDefined();
    expect(rejectButton!.value).toBe('task-uuid-123');
  });
});
