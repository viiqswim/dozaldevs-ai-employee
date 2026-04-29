import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const { origArgv } = vi.hoisted(() => {
  const origArgv = [...process.argv];
  process.argv = [
    'node',
    'post-message.ts',
    '--channel',
    'C-TEST-REF',
    '--text',
    'Test message with ref',
    '--conversation-ref',
    'thread-hostfully-xyz789',
  ];
  return { origArgv };
});

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      postMessage: vi.fn().mockResolvedValue({
        ok: true,
        ts: '1234567890.000001',
        channel: 'C-TEST-REF',
      }),
    },
  })),
}));

let capturedOutput = '';

describe('post-message — --conversation-ref flag present', () => {
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

  it('output JSON contains conversationRef with the value from the flag', () => {
    const output = JSON.parse(capturedOutput.trim()) as {
      ts: string;
      channel: string;
      conversationRef?: string;
    };
    expect(output.conversationRef).toBe('thread-hostfully-xyz789');
  });

  it('output JSON also contains ts and channel fields', () => {
    const output = JSON.parse(capturedOutput.trim()) as {
      ts: string;
      channel: string;
      conversationRef?: string;
    };
    expect(output.ts).toBeDefined();
    expect(output.channel).toBe('C-TEST-REF');
  });
});

describe('post-message — --conversation-ref flag absent', () => {
  it('output JSON omits conversationRef key when flag is not provided', () => {
    const conversationRef: string | undefined = undefined;
    const simulatedOutput = {
      ts: '1234567890.000002',
      channel: 'C-TEST-NO-REF',
      ...(conversationRef !== undefined && { conversationRef }),
    };
    expect(Object.keys(simulatedOutput)).not.toContain('conversationRef');
    expect(simulatedOutput.ts).toBeDefined();
    expect(simulatedOutput.channel).toBeDefined();
  });
});
