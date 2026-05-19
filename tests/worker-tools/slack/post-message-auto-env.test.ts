import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockPostMessage: ReturnType<typeof vi.fn>;

const BASE_ARGV = ['node', 'post-message.ts', '--channel', 'C-TEST', '--text', 'Hello'];
let savedArgv: string[];

beforeEach(() => {
  savedArgv = [...process.argv];
  mockPostMessage = vi.fn().mockResolvedValue({
    ok: true,
    ts: '999.000',
    channel: 'C-TEST',
  });
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  process.argv = savedArgv;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.NOTIFY_MSG_TS;
  delete process.env.INNGEST_RUN_ID;
  delete process.env.APPROVAL_REQUIRED;
  vi.restoreAllMocks();
  vi.doUnmock('@slack/web-api');
});

async function runModule(): Promise<void> {
  vi.resetModules();
  vi.doMock('@slack/web-api', () => ({
    WebClient: vi.fn().mockImplementation(() => ({
      chat: { postMessage: mockPostMessage },
    })),
  }));
  await import('../../../src/worker-tools/slack/post-message.js');
  await new Promise<void>((resolve) => setTimeout(resolve, 200));
}

describe('post-message — auto-threading (NOTIFY_MSG_TS)', () => {
  it('1. NOTIFY_MSG_TS env var → postMessage called with thread_ts from env', async () => {
    process.env.NOTIFY_MSG_TS = '111.000';
    process.argv = [...BASE_ARGV];
    await runModule();
    expect(mockPostMessage).toHaveBeenCalled();
    const arg = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.thread_ts).toBe('111.000');
  });

  it('2. explicit --thread-ts flag wins over NOTIFY_MSG_TS env var', async () => {
    process.env.NOTIFY_MSG_TS = '111.000';
    process.argv = [...BASE_ARGV, '--thread-ts', '222.000'];
    await runModule();
    expect(mockPostMessage).toHaveBeenCalled();
    const arg = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.thread_ts).toBe('222.000');
  });

  it('3. NOTIFY_MSG_TS="" (empty string) → postMessage called WITHOUT thread_ts property', async () => {
    process.env.NOTIFY_MSG_TS = '';
    process.argv = [...BASE_ARGV];
    await runModule();
    expect(mockPostMessage).toHaveBeenCalled();
    const arg = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('thread_ts');
  });

  it('4. NOTIFY_MSG_TS not set → postMessage called WITHOUT thread_ts property', async () => {
    delete process.env.NOTIFY_MSG_TS;
    process.argv = [...BASE_ARGV];
    await runModule();
    expect(mockPostMessage).toHaveBeenCalled();
    const arg = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('thread_ts');
  });

  it('5. --no-thread flag suppresses NOTIFY_MSG_TS env var', async () => {
    process.env.NOTIFY_MSG_TS = '111.000';
    process.argv = [...BASE_ARGV, '--no-thread'];
    await runModule();
    expect(mockPostMessage).toHaveBeenCalled();
    const arg = mockPostMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('thread_ts');
  });
});

describe('post-message — auto-Run-ID (INNGEST_RUN_ID)', () => {
  it('6. INNGEST_RUN_ID set → context block contains both Task and Run entries', async () => {
    process.env.INNGEST_RUN_ID = '01KS10KM3J6JNYSX1HRFRE7HMY';
    process.argv = [...BASE_ARGV, '--task-id', 'task-uuid'];
    await runModule();
    expect(mockPostMessage).toHaveBeenCalled();
    const arg = mockPostMessage.mock.calls[0][0] as {
      blocks?: Array<{ type: string; elements?: Array<{ type: string; text: string }> }>;
    };
    const contextBlock = (arg.blocks ?? []).find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const texts = (contextBlock?.elements ?? []).map((e) => e.text);
    expect(texts).toContain('Task `task-uuid`');
    expect(texts).toContain('Run `01KS10KM3J6JNYSX1HRFRE7HMY`');
  });

  it('7. INNGEST_RUN_ID not set → context block contains only Task entry, no crash', async () => {
    delete process.env.INNGEST_RUN_ID;
    process.argv = [...BASE_ARGV, '--task-id', 'task-uuid'];
    await runModule();
    expect(mockPostMessage).toHaveBeenCalled();
    const arg = mockPostMessage.mock.calls[0][0] as {
      blocks?: Array<{ type: string; elements?: Array<{ type: string; text: string }> }>;
    };
    const contextBlock = (arg.blocks ?? []).find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const texts = (contextBlock?.elements ?? []).map((e) => e.text);
    expect(texts).toContain('Task `task-uuid`');
    expect(texts.some((t) => t.includes('Run `'))).toBe(false);
  });
});
