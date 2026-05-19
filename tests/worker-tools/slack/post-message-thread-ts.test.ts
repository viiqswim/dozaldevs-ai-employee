import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const { origArgv, mockPostMessage } = vi.hoisted(() => {
  const origArgv = [...process.argv];
  process.argv = [
    'node',
    'post-message.ts',
    '--channel',
    'C-THREAD-TEST',
    '--text',
    'Hello in thread',
    '--thread-ts',
    '123.456',
  ];
  const mockPostMessage = vi.fn().mockResolvedValue({
    ok: true,
    ts: '999.000',
    channel: 'C-THREAD-TEST',
  });
  return { origArgv, mockPostMessage };
});

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

let capturedOutput = '';

describe('post-message — --thread-ts flag', () => {
  beforeAll(async () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      capturedOutput += String(data);
      return true;
    });

    await import('../../../src/worker-tools/slack/post-message.js');
    await new Promise((resolve) => setTimeout(resolve, 500));

    stdoutSpy.mockRestore();
  });

  afterAll(() => {
    process.argv = origArgv;
    delete process.env.SLACK_BOT_TOKEN;
  });

  it('postMessage is called with thread_ts matching the --thread-ts flag value', () => {
    expect(mockPostMessage).toHaveBeenCalled();
    const callArg = mockPostMessage.mock.calls[0][0] as { thread_ts?: string };
    expect(callArg.thread_ts).toBe('123.456');
  });

  it('postMessage is called with the correct channel and text', () => {
    const callArg = mockPostMessage.mock.calls[0][0] as { channel: string; text: string };
    expect(callArg.channel).toBe('C-THREAD-TEST');
    expect(callArg.text).toBe('Hello in thread');
  });

  it('output JSON contains ts and channel', () => {
    const output = JSON.parse(capturedOutput.trim()) as { ts: string; channel: string };
    expect(output.ts).toBeDefined();
    expect(output.channel).toBe('C-THREAD-TEST');
  });
});
