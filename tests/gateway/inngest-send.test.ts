import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendTaskReceivedEvent } from '../../src/gateway/inngest/send.js';
import type { InngestLike } from '../../src/gateway/server.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeInngestMock(responses: Array<'success' | 'fail'>): InngestLike {
  let callCount = 0;
  return {
    send: vi.fn(async () => {
      const response = responses[callCount] ?? 'fail';
      callCount++;
      if (response === 'fail') {
        throw new Error(`Mock failure ${callCount}`);
      }
      return { ids: ['mock-id'] };
    }),
  };
}

describe('sendTaskReceivedEvent', () => {
  it('returns success on first try', async () => {
    const inngest = makeInngestMock(['success']);
    const result = await sendTaskReceivedEvent({
      inngest,
      taskId: 'task-1',
      projectId: 'proj-1',
    });
    expect(result.success).toBe(true);
    expect((inngest.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('sends event with correct name and data', async () => {
    const inngest = makeInngestMock(['success']);
    await sendTaskReceivedEvent({ inngest, taskId: 'task-abc', projectId: 'proj-xyz' });
    const call = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.name).toBe('engineering/task.received');
    expect(call.data.taskId).toBe('task-abc');
    expect(call.data.projectId).toBe('proj-xyz');
  });

  it('includes eventId when provided', async () => {
    const inngest = makeInngestMock(['success']);
    await sendTaskReceivedEvent({
      inngest,
      taskId: 'task-1',
      projectId: 'proj-1',
      eventId: 'unique-id',
    });
    const call = (inngest.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.id).toBe('unique-id');
  });

  it(
    'retries on first failure, succeeds on second',
    async () => {
      const inngest = makeInngestMock(['fail', 'success']);
      const result = await sendTaskReceivedEvent({
        inngest,
        taskId: 'task-1',
        projectId: 'proj-1',
      });
      expect(result.success).toBe(true);
      expect((inngest.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    },
    { timeout: 10000 },
  );

  it(
    'retries on first two failures, succeeds on third',
    async () => {
      const inngest = makeInngestMock(['fail', 'fail', 'success']);
      const result = await sendTaskReceivedEvent({
        inngest,
        taskId: 'task-1',
        projectId: 'proj-1',
      });
      expect(result.success).toBe(true);
      expect((inngest.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    },
    { timeout: 15000 },
  );

  it(
    'returns failure after 3 retries exhausted (no throw)',
    async () => {
      const inngest = makeInngestMock(['fail', 'fail', 'fail']);
      const result = await sendTaskReceivedEvent({
        inngest,
        taskId: 'task-1',
        projectId: 'proj-1',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Mock failure');
      expect((inngest.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
    },
    { timeout: 20000 },
  );

  it(
    'does not throw even when all retries fail',
    async () => {
      const inngest = makeInngestMock(['fail', 'fail', 'fail']);
      await expect(
        sendTaskReceivedEvent({ inngest, taskId: 'task-1', projectId: 'proj-1' }),
      ).resolves.not.toThrow();
    },
    { timeout: 20000 },
  );
});
