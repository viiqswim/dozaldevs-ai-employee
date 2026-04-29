import { describe, it, expect, vi } from 'vitest';

const { origArgv } = vi.hoisted(() => {
  const origArgv = [...process.argv];
  process.argv = [
    'node',
    'post-no-action-notification.ts',
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
    '--summary',
    'Guest acknowledged check-in instructions',
    '--confidence',
    '0.95',
    '--category',
    'acknowledgment',
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

import { buildNoActionBlocks } from '../../../src/worker-tools/slack/post-no-action-notification.js';

const baseParams = {
  channel: 'C123',
  taskId: 'task-uuid-123',
  guestName: 'John Smith',
  propertyName: 'Oceanview Villa',
  checkIn: '2026-05-01',
  checkOut: '2026-05-05',
  bookingChannel: 'Airbnb',
  originalMessage: 'Ok got it',
  summary: 'Guest acknowledged check-in instructions',
  confidence: 0.95,
  category: 'acknowledgment',
  leadUid: 'lead-1',
  threadUid: 'thread-1',
  messageUid: 'msg-1',
  dryRun: true,
};

describe('buildNoActionBlocks', () => {
  // ─── 1. Block count ───────────────────────────────────────────────────────

  it('returns at least 7 blocks', () => {
    const blocks = buildNoActionBlocks(baseParams);
    expect(blocks.length).toBeGreaterThanOrEqual(7);
  });

  // ─── 2. Action ID present ─────────────────────────────────────────────────

  it('contains action_id guest_reply_anyway in actions block', () => {
    const blocks = buildNoActionBlocks(baseParams);
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: Array<{ action_id: string }> }
      | undefined;

    expect(actionsBlock).toBeDefined();
    const actionIds = actionsBlock!.elements.map((e) => e.action_id);
    expect(actionIds).toContain('guest_reply_anyway');
  });

  // ─── 3. Context block with task ID ────────────────────────────────────────

  it('contains task ID in context block', () => {
    const blocks = buildNoActionBlocks(baseParams);
    const contextBlock = blocks.find((b) => (b as { type: string }).type === 'context') as
      | { elements: Array<{ text: string }> }
      | undefined;

    expect(contextBlock).toBeDefined();
    const contextText = contextBlock!.elements[0]?.text ?? '';
    expect(contextText).toContain('task-uuid-123');
  });

  // ─── 4. Reply Anyway button value is plain taskId ─────────────────────────

  it('Reply Anyway button value is the plain taskId string', () => {
    const blocks = buildNoActionBlocks(baseParams);
    const actionsBlock = blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: Array<{ action_id: string; value: string }> }
      | undefined;

    const replyButton = actionsBlock!.elements.find((e) => e.action_id === 'guest_reply_anyway');
    expect(replyButton).toBeDefined();
    expect(replyButton!.value).toBe('task-uuid-123');
  });

  // ─── 5. Original message truncated to 300 chars when longer ───────────────

  it('truncates originalMessage to 300 chars when longer', () => {
    const longMessage = 'x'.repeat(400);
    const blocks = buildNoActionBlocks({ ...baseParams, originalMessage: longMessage });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('x'.repeat(300) + '...');
    expect(allText).not.toContain('x'.repeat(301));
  });

  // ─── 6. Original message NOT truncated when ≤300 chars ───────────────────

  it('does not truncate originalMessage when 300 chars or fewer', () => {
    const shortMessage = 'y'.repeat(300);
    const blocks = buildNoActionBlocks({ ...baseParams, originalMessage: shortMessage });
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('y'.repeat(300));
    expect(allText).not.toContain('y'.repeat(300) + '...');
  });

  // ─── 7. Confidence shown as percentage ────────────────────────────────────

  it('shows confidence as percentage (e.g., 95%)', () => {
    const blocks = buildNoActionBlocks({ ...baseParams, confidence: 0.95 });
    const confidenceBlock = blocks.find(
      (b) => (b as { type: string }).type === 'section' && JSON.stringify(b).includes('95%'),
    );
    expect(confidenceBlock).toBeDefined();
  });

  // ─── 8. Guest name and property name present ──────────────────────────────

  it('includes guestName and propertyName in blocks', () => {
    const blocks = buildNoActionBlocks(baseParams);
    const allText = JSON.stringify(blocks);
    expect(allText).toContain('John Smith');
    expect(allText).toContain('Oceanview Villa');
  });

  // ─── 9. conversationSummary block added when provided ────────────────────

  it('adds conversationSummary block when provided', () => {
    const blocks = buildNoActionBlocks({
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

  // ─── 10. No conversationSummary block when not provided ──────────────────

  it('does not add conversationSummary block when not provided', () => {
    const { conversationSummary: _cs, ...paramsWithoutSummary } =
      baseParams as typeof baseParams & {
        conversationSummary?: string;
      };
    const blocks = buildNoActionBlocks({
      ...paramsWithoutSummary,
      conversationSummary: undefined,
    });
    const summaryBlocks = blocks.filter((b) => JSON.stringify(b).includes('Conversation Summary'));
    expect(summaryBlocks.length).toBe(0);
  });
});

void origArgv;
