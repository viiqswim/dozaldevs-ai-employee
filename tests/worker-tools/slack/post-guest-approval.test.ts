import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { WebClient } from '@slack/web-api';

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
  replyBroadcast: false,
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

describe('idempotency guard', () => {
  it('skips Slack post when /tmp/approval-message.json already exists', async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    vi.mocked(readFileSync).mockReturnValueOnce(
      '{"ts":"1234567890.123456","channel":"C0960S2Q8RL"}',
    );

    const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' });
    vi.mocked(WebClient).mockImplementationOnce(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );

    const stdoutChunks: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    const writeStub = (chunk: string | Uint8Array, ...args: unknown[]) => {
      stdoutChunks.push(String(chunk));
      void args;
      return true;
    };
    process.stdout.write = writeStub as typeof process.stdout.write;

    const savedArgv = [...process.argv];
    process.argv = [
      'node',
      'post-guest-approval.ts',
      '--channel',
      'C0960S2Q8RL',
      '--task-id',
      'task-guard-test',
      '--guest-name',
      'Guard Test',
      '--property-name',
      'Test Property',
      '--check-in',
      '2026-01-01',
      '--check-out',
      '2026-01-05',
      '--booking-channel',
      'AIRBNB',
      '--original-message',
      'Hello',
      '--draft-response',
      'Hi there',
      '--confidence',
      '0.9',
      '--category',
      'test',
      '--lead-uid',
      'lead-guard',
      '--thread-uid',
      'thread-guard',
      '--message-uid',
      'msg-guard',
    ];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;
    process.stdout.write = origWrite;

    expect(mockPostMessage).not.toHaveBeenCalled();
    const stdout = stdoutChunks.join('');
    expect(stdout).toContain('1234567890.123456');
  });

  it('proceeds past idempotency guard when existing ts is a PLACEHOLDER value', async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    vi.mocked(readFileSync).mockReturnValueOnce(
      '{"ts":"CHANNEL_ID_PLACEHOLDER","channel":"C-TEST"}',
    );

    vi.mocked(WebClient).mockReset();
    const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-new', channel: 'C-new' });
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );

    const savedEnv = process.env.SLACK_BOT_TOKEN;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    const origWritePH = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    const savedArgv = [...process.argv];
    process.argv = [
      'node',
      'post-guest-approval.ts',
      '--channel',
      'C-TEST',
      '--task-id',
      'task-ph-test',
      '--guest-name',
      'PH Test Guest',
      '--property-name',
      'Test Property',
      '--check-in',
      '2026-01-01',
      '--check-out',
      '2026-01-05',
      '--booking-channel',
      'AIRBNB',
      '--original-message',
      'Hello',
      '--draft-response',
      'Hi there',
      '--confidence',
      '0.9',
      '--category',
      'test',
      '--lead-uid',
      'lead-ph',
      '--thread-uid',
      'thread-ph',
      '--message-uid',
      'msg-ph',
    ];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;
    process.env.SLACK_BOT_TOKEN = savedEnv;
    process.stdout.write = origWritePH;
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({
          chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
        }) as unknown as InstanceType<typeof WebClient>,
    );

    expect(mockPostMessage).toHaveBeenCalled();
  });
});

describe('--thread-ts flag', () => {
  const baseArgv = [
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
  ];

  let origWrite: typeof process.stdout.write;
  let origEnv: string | undefined;
  let mockPostMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    origEnv = process.env.SLACK_BOT_TOKEN;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    vi.mocked(existsSync).mockReturnValue(false);
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-test', channel: 'C-test' });
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  afterEach(() => {
    process.env.SLACK_BOT_TOKEN = origEnv;
    process.stdout.write = origWrite;
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({
          chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
        }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  it('passes thread_ts to postMessage when --thread-ts is provided', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv, '--thread-ts', '1234.5678'];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage.mock.calls[0][0]).toMatchObject({ thread_ts: '1234.5678' });
  });

  it('does not pass thread_ts to postMessage when --thread-ts is absent', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage.mock.calls[0][0]).not.toHaveProperty('thread_ts');
  });

  it('does not pass thread_ts to postMessage when --thread-ts is empty string', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv, '--thread-ts', ''];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(mockPostMessage).toHaveBeenCalledOnce();
    expect(mockPostMessage.mock.calls[0][0]).not.toHaveProperty('thread_ts');
  });
});

describe('--conversation-ref flag', () => {
  const baseArgv = [
    'node',
    'post-guest-approval.ts',
    '--channel',
    'C-TEST',
    '--task-id',
    'task-conv-ref-test',
    '--guest-name',
    'ConvRef Test',
    '--property-name',
    'Test Property',
    '--check-in',
    '2026-01-01',
    '--check-out',
    '2026-01-05',
    '--booking-channel',
    'AIRBNB',
    '--original-message',
    'Hello',
    '--draft-response',
    'Hi there',
    '--confidence',
    '0.9',
    '--category',
    'test',
    '--lead-uid',
    'lead-conv-ref',
    '--thread-uid',
    'thread-conv-ref',
    '--message-uid',
    'msg-conv-ref',
  ];

  let origWrite: typeof process.stdout.write;
  let origEnv: string | undefined;
  let mockPostMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    origEnv = process.env.SLACK_BOT_TOKEN;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(writeFileSync).mockClear();
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-conv', channel: 'C-conv' });
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  afterEach(() => {
    process.env.SLACK_BOT_TOKEN = origEnv;
    process.stdout.write = origWrite;
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({
          chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
        }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  it('uses --conversation-ref value in writeFileSync output when flag is provided', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv, '--conversation-ref', 'conv-ref-value-123'];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const [path, content] = vi.mocked(writeFileSync).mock.calls[0] as [string, string];
    expect(path).toBe('/tmp/approval-message.json');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.conversationRef).toBe('conv-ref-value-123');
    expect(parsed.conversation_ref).toBe('conv-ref-value-123');
  });

  it('falls back to threadUid in writeFileSync output when --conversation-ref is absent', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const [, content] = vi.mocked(writeFileSync).mock.calls[0] as [string, string];
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.conversationRef).toBe('thread-conv-ref');
    expect(parsed.conversation_ref).toBe('thread-conv-ref');
  });
});

describe('self-write /tmp/approval-message.json', () => {
  const baseArgv = [
    'node',
    'post-guest-approval.ts',
    '--channel',
    'C-WRITE-TEST',
    '--task-id',
    'task-write-test',
    '--guest-name',
    'Write Test Guest',
    '--property-name',
    'Write Test Property',
    '--check-in',
    '2026-03-01',
    '--check-out',
    '2026-03-05',
    '--booking-channel',
    'VRBO',
    '--original-message',
    'What are the house rules?',
    '--draft-response',
    'Please refer to our house manual.',
    '--confidence',
    '0.85',
    '--category',
    'rules',
    '--lead-uid',
    'lead-write',
    '--thread-uid',
    'thread-write',
    '--message-uid',
    'msg-write',
  ];

  let origWrite: typeof process.stdout.write;
  let origEnv: string | undefined;
  let mockPostMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    origEnv = process.env.SLACK_BOT_TOKEN;
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(writeFileSync).mockClear();
    origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (() => true) as typeof process.stdout.write;

    mockPostMessage = vi
      .fn()
      .mockResolvedValue({ ok: true, ts: 'ts-write-123', channel: 'C-WRITE-TEST' });
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({ chat: { postMessage: mockPostMessage } }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  afterEach(() => {
    process.env.SLACK_BOT_TOKEN = origEnv;
    process.stdout.write = origWrite;
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(WebClient).mockReset();
    vi.mocked(WebClient).mockImplementation(
      () =>
        ({
          chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts1', channel: 'C1' }) },
        }) as unknown as InstanceType<typeof WebClient>,
    );
  });

  it('calls writeFileSync with path /tmp/approval-message.json after successful Slack post', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeFileSync).mock.calls[0][0]).toBe('/tmp/approval-message.json');
  });

  it('written JSON contains required fields: ts, channel, conversationRef, approval_message_ts, target_channel, conversation_ref', async () => {
    const savedArgv = [...process.argv];
    process.argv = [...baseArgv];

    const { main } = await import('../../../src/worker-tools/slack/post-guest-approval.js');
    await main();

    process.argv = savedArgv;

    const [, content] = vi.mocked(writeFileSync).mock.calls[0] as [string, string];
    const parsed = JSON.parse(content) as Record<string, unknown>;

    expect(parsed).toHaveProperty('ts', 'ts-write-123');
    expect(parsed).toHaveProperty('channel', 'C-WRITE-TEST');
    expect(parsed).toHaveProperty('conversationRef');
    expect(parsed).toHaveProperty('approval_message_ts', 'ts-write-123');
    expect(parsed).toHaveProperty('target_channel', 'C-WRITE-TEST');
    expect(parsed).toHaveProperty('conversation_ref');
  });
});
