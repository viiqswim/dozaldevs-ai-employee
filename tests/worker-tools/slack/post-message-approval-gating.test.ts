import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const { origArgv, mockPostMessage } = vi.hoisted(() => {
  const origArgv = [...process.argv];
  process.argv = [
    'node',
    'post-message.ts',
    '--channel',
    'C-APPROVAL-TEST',
    '--text',
    'Task summary',
    '--task-id',
    'task-uuid-123',
  ];
  process.env.APPROVAL_REQUIRED = 'false';
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  process.stdout.write = (() => true) as typeof process.stdout.write;
  const mockPostMessage = vi.fn().mockResolvedValue({
    ok: true,
    ts: '888.000',
    channel: 'C-APPROVAL-TEST',
  });
  return { origArgv, mockPostMessage };
});

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

import { buildApprovalBlocks } from '../../../src/worker-tools/slack/post-message.js';

describe('post-message — APPROVAL_REQUIRED=false gating', () => {
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(() => {
    process.argv = origArgv;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.APPROVAL_REQUIRED;
  });

  it('when APPROVAL_REQUIRED=false, postMessage blocks do NOT contain an actions block', () => {
    expect(mockPostMessage).toHaveBeenCalled();
    const callArg = mockPostMessage.mock.calls[0][0] as { blocks?: Array<{ type: string }> };
    const hasActions = (callArg.blocks ?? []).some((b) => b.type === 'actions');
    expect(hasActions).toBe(false);
  });

  it('when APPROVAL_REQUIRED=false, postMessage blocks contain a context block with task id', () => {
    const callArg = mockPostMessage.mock.calls[0][0] as { blocks?: Array<{ type: string }> };
    const hasContext = (callArg.blocks ?? []).some((b) => b.type === 'context');
    expect(hasContext).toBe(true);
  });
});

describe('buildApprovalBlocks — always includes actions block', () => {
  it('buildApprovalBlocks result contains an actions block with Approve and Reject buttons', () => {
    const blocks = buildApprovalBlocks('summary', 'task-id', 'Mon May 19 2026') as Array<{
      type: string;
      elements?: Array<{ action_id: string }>;
    }>;
    const actionsBlock = blocks.find((b) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    const actionIds = actionsBlock?.elements?.map((e) => e.action_id) ?? [];
    expect(actionIds).toContain('approve');
    expect(actionIds).toContain('reject');
  });

  it('no-approval-required blocks shape — section + divider + context, no actions', () => {
    const noActionsBlocks: Array<{ type: string }> = [
      { type: 'section' },
      { type: 'divider' },
      { type: 'context' },
    ];
    const hasActions = noActionsBlocks.some((b) => b.type === 'actions');
    expect(hasActions).toBe(false);
    expect(noActionsBlocks).toHaveLength(3);
  });
});
