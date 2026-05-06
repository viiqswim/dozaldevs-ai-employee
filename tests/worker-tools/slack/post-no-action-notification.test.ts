import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { WebClient } from '@slack/web-api';

import {
  buildNoActionBlocks,
  main,
} from '../../../src/worker-tools/slack/post-no-action-notification.js';

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

describe('--thread-ts flag', () => {
  const baseArgv = [
    'node',
    'post-no-action-notification.ts',
    '--channel',
    'C-THREAD-TEST',
    '--task-id',
    'task-thread-test',
    '--guest-name',
    'Jane Guest',
    '--property-name',
    'Villa Test',
    '--check-in',
    '2026-05-01',
    '--check-out',
    '2026-05-05',
    '--booking-channel',
    'AIRBNB',
    '--original-message',
    'Got it thanks',
    '--summary',
    'Guest acknowledged check-in instructions',
    '--confidence',
    '0.9',
    '--category',
    'acknowledgment',
    '--lead-uid',
    'lead-thread',
    '--thread-uid',
    'thread-thread',
    '--message-uid',
    'msg-thread',
  ];

  let savedArgv: string[];
  let savedToken: string | undefined;
  let origWrite: typeof process.stdout.write;

  beforeEach(() => {
    savedArgv = [...process.argv];
    savedToken = process.env.SLACK_BOT_TOKEN;
    process.env.SLACK_BOT_TOKEN = 'test-token';
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.argv = savedArgv;
    if (savedToken !== undefined) {
      process.env.SLACK_BOT_TOKEN = savedToken;
    } else {
      delete process.env.SLACK_BOT_TOKEN;
    }
    process.stdout.write = origWrite;
  });

  // ─── 11. --thread-ts provided → postMessage receives thread_ts ───────────

  it('calls postMessage with thread_ts when --thread-ts is provided', async () => {
    const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts2', channel: 'C2' });
    vi.mocked(WebClient).mockImplementationOnce(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );

    process.argv = [...baseArgv, '--thread-ts', '1234.5678'];
    await main();

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ thread_ts: '1234.5678' }),
    );
  });

  // ─── 12. no --thread-ts → postMessage has no thread_ts ───────────────────

  it('calls postMessage WITHOUT thread_ts when --thread-ts is not provided', async () => {
    const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts3', channel: 'C3' });
    vi.mocked(WebClient).mockImplementationOnce(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );

    process.argv = [...baseArgv];
    await main();

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({ thread_ts: expect.anything() }),
    );
  });

  // ─── 13. --thread-ts "" (empty) → postMessage has no thread_ts ───────────

  it('calls postMessage WITHOUT thread_ts when --thread-ts is empty string', async () => {
    const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts4', channel: 'C4' });
    vi.mocked(WebClient).mockImplementationOnce(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );

    process.argv = [...baseArgv, '--thread-ts', ''];
    await main();

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.not.objectContaining({ thread_ts: expect.anything() }),
    );
  });
});

void origArgv;
