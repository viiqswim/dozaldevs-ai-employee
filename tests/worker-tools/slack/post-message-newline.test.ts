import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const { origArgv, mockPostMessage } = vi.hoisted(() => {
  const origArgv = [...process.argv];
  process.argv = [
    'node',
    'post-message.ts',
    '--channel',
    'C-NEWLINE-TEST',
    '--text',
    'Line1\\nLine2',
  ];
  const mockPostMessage = vi.fn().mockResolvedValue({
    ok: true,
    ts: '111.222',
    channel: 'C-NEWLINE-TEST',
  });
  return { origArgv, mockPostMessage };
});

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

describe('post-message — newline normalization', () => {
  beforeAll(async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    await import('../../../src/worker-tools/slack/post-message.js');
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(() => {
    process.argv = origArgv;
    delete process.env.SLACK_BOT_TOKEN;
  });

  it('converts literal backslash-n sequence to a real newline character', () => {
    expect(mockPostMessage).toHaveBeenCalled();
    const callArg = mockPostMessage.mock.calls[0][0] as { text: string };
    expect(callArg.text).toContain('\n');
    expect(callArg.text).not.toContain('\\n');
    expect(callArg.text).toBe('Line1\nLine2');
  });
});
