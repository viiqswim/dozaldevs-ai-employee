import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPostMessage = vi.fn();

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

import { slackPostMessageTool } from '../../../src/workers/tools/slack-post-message.js';
import { createLogger } from '../../../src/lib/logger.js';

const ctx = {
  taskId: 'task-1',
  env: { SLACK_BOT_TOKEN: 'xoxb-test' },
  logger: createLogger('test'),
};

describe('slackPostMessageTool', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    mockPostMessage.mockResolvedValue({ ok: true, ts: '1234567890.123456', channel: 'C123' });
  });

  it('is registered with name slack.postMessage', () => {
    expect(slackPostMessageTool.name).toBe('slack.postMessage');
  });

  it('returns ts and channel on success', async () => {
    const result = await slackPostMessageTool.execute(
      {
        channel: 'C123',
        summary_text: 'Test summary',
        stats: { messages: 10, threads: 2, participants: 5 },
        task_id: 'task-1',
      },
      ctx,
    );
    expect(result).toEqual({ ts: '1234567890.123456', channel: 'C123' });
  });

  it('throws when SLACK_BOT_TOKEN is missing', async () => {
    await expect(
      slackPostMessageTool.execute(
        {
          channel: 'C123',
          summary_text: 'Test',
          stats: { messages: 1, threads: 0, participants: 1 },
          task_id: 'task-1',
        },
        { ...ctx, env: {} },
      ),
    ).rejects.toThrow('SLACK_BOT_TOKEN is not set');
  });

  it('includes approve and reject buttons in blocks', async () => {
    await slackPostMessageTool.execute(
      {
        channel: 'C123',
        summary_text: 'Test',
        stats: { messages: 1, threads: 0, participants: 1 },
        task_id: 'task-abc',
      },
      ctx,
    );

    const callArgs = mockPostMessage.mock.calls[0][0] as {
      blocks: Array<{ type: string; elements?: Array<{ action_id: string; value: string }> }>;
    };
    const actionsBlock = callArgs.blocks.find((b) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock?.elements).toHaveLength(2);
    expect(actionsBlock?.elements?.[0].action_id).toBe('approve');
    expect(actionsBlock?.elements?.[0].value).toBe('task-abc');
    expect(actionsBlock?.elements?.[1].action_id).toBe('reject');
  });

  it('includes stats text in context block', async () => {
    await slackPostMessageTool.execute(
      {
        channel: 'C123',
        summary_text: 'Hello',
        stats: { messages: 42, threads: 7, participants: 3 },
        task_id: 't1',
      },
      ctx,
    );

    const callArgs = mockPostMessage.mock.calls[0][0] as {
      blocks: Array<{ type: string; elements?: Array<{ type: string; text: string }> }>;
    };
    const contextBlock = callArgs.blocks.find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    expect(contextBlock?.elements?.[0].text).toContain('42 messages');
    expect(contextBlock?.elements?.[0].text).toContain('7 threads');
    expect(contextBlock?.elements?.[0].text).toContain('3 participants');
  });

  it('sends the correct channel and fallback text to Slack', async () => {
    mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '999', channel: 'C456' });

    await slackPostMessageTool.execute(
      {
        channel: 'C456',
        summary_text: 'My summary',
        stats: { messages: 5, threads: 1, participants: 2 },
        task_id: 't2',
      },
      ctx,
    );

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C456',
        text: '📰 Daily Summary pending approval',
      }),
    );
  });
});
