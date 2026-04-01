import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { runWatchdog } from '../../src/inngest/watchdog.js';
import type { FlyClient, WatchdogResult } from '../../src/inngest/watchdog.js';
import type { SlackClient } from '../../src/lib/slack-client.js';

function makeFlyClient(): FlyClient {
  return {
    getMachine: vi.fn(),
    destroyMachine: vi.fn().mockResolvedValue(undefined),
    createMachine: vi.fn(),
  };
}

function makeSlackClient(): SlackClient {
  return {
    postMessage: vi.fn().mockResolvedValue({ ts: '1234567890.000100', channel: 'C123' }),
  };
}

function makeInngest() {
  return { send: vi.fn().mockResolvedValue({ ids: [] }) };
}

function makePrisma(overrides: Partial<PrismaClient> = {}): PrismaClient {
  return {
    execution: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    taskStatusLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

beforeEach(() => {
  process.env.FLY_WORKER_APP = 'test-worker-app';
});

describe('runWatchdog', () => {
  describe('stale execution with dead machine', () => {
    it('sets task to Ready and increments dispatch_attempts when getMachine returns null', async () => {
      const taskId = 'task-dead-machine';
      const execId = 'exec-001';
      const fly = makeFlyClient();
      const slack = makeSlackClient();
      const inngest = makeInngest();

      vi.mocked(fly.getMachine).mockResolvedValue(null);

      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const statusLogCreate = vi.fn().mockResolvedValue({});

      const prisma = makePrisma({
        execution: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              {
                id: execId,
                runtime_id: 'machine-abc',
                task: { id: taskId, dispatch_attempts: 0, status: 'Executing' },
              },
            ])
            .mockResolvedValueOnce([]),
        } as unknown as PrismaClient['execution'],
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany,
        } as unknown as PrismaClient['task'],
        taskStatusLog: {
          create: statusLogCreate,
        } as unknown as PrismaClient['taskStatusLog'],
      });

      const result: WatchdogResult = await runWatchdog(prisma, fly, inngest, slack);

      expect(result.staleMachinesDetected).toBe(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: taskId },
        data: expect.objectContaining({ status: 'Ready', dispatch_attempts: 1 }),
      });
      expect(statusLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          task_id: taskId,
          from_status: 'Executing',
          to_status: 'Ready',
          actor: 'watchdog',
        }),
      });
    });
  });

  describe('alive machine', () => {
    it('does NOT update the task when getMachine returns state=started', async () => {
      const taskId = 'task-alive';
      const execId = 'exec-002';
      const fly = makeFlyClient();
      const slack = makeSlackClient();
      const inngest = makeInngest();

      vi.mocked(fly.getMachine).mockResolvedValue({ id: 'machine-xyz', state: 'started' });

      const updateMany = vi.fn().mockResolvedValue({ count: 1 });

      const prisma = makePrisma({
        execution: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              {
                id: execId,
                runtime_id: 'machine-xyz',
                task: { id: taskId, dispatch_attempts: 0, status: 'Executing' },
              },
            ])
            .mockResolvedValueOnce([]),
        } as unknown as PrismaClient['execution'],
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany,
        } as unknown as PrismaClient['task'],
        taskStatusLog: {
          create: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['taskStatusLog'],
      });

      const result = await runWatchdog(prisma, fly, inngest, slack);

      expect(result.staleMachinesDetected).toBe(0);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('dispatch_attempts >= 3', () => {
    it('sets task to AwaitingInput and calls Slack', async () => {
      const taskId = 'task-maxed-out';
      const fly = makeFlyClient();
      const slack = makeSlackClient();
      const inngest = makeInngest();

      vi.mocked(fly.getMachine).mockResolvedValue(null);

      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const statusLogCreate = vi.fn().mockResolvedValue({});

      const prisma = makePrisma({
        execution: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              {
                id: 'exec-003',
                runtime_id: 'machine-dead',
                task: { id: taskId, dispatch_attempts: 3, status: 'Executing' },
              },
            ])
            .mockResolvedValueOnce([]),
        } as unknown as PrismaClient['execution'],
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany,
        } as unknown as PrismaClient['task'],
        taskStatusLog: {
          create: statusLogCreate,
        } as unknown as PrismaClient['taskStatusLog'],
      });

      const result = await runWatchdog(prisma, fly, inngest, slack);

      expect(result.escalated).toBe(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: taskId },
        data: expect.objectContaining({
          status: 'AwaitingInput',
          failure_reason: 'Max dispatch attempts (3) exceeded',
        }),
      });
      expect(statusLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          task_id: taskId,
          to_status: 'AwaitingInput',
          actor: 'watchdog',
        }),
      });
      expect(slack.postMessage).toHaveBeenCalledOnce();
    });
  });

  describe('terminal state task', () => {
    it('skips tasks with status=Done entirely', async () => {
      const fly = makeFlyClient();
      const slack = makeSlackClient();
      const inngest = makeInngest();
      const updateMany = vi.fn();

      const prisma = makePrisma({
        execution: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([
              {
                id: 'exec-done',
                runtime_id: 'machine-done',
                task: { id: 'task-done', dispatch_attempts: 0, status: 'Done' },
              },
            ])
            .mockResolvedValueOnce([]),
        } as unknown as PrismaClient['execution'],
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany,
        } as unknown as PrismaClient['task'],
        taskStatusLog: {
          create: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['taskStatusLog'],
      });

      await runWatchdog(prisma, fly, inngest, slack);

      expect(fly.getMachine).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('4h+ machine destruction', () => {
    it('calls destroyMachine for long-running executions', async () => {
      const fly = makeFlyClient();
      const slack = makeSlackClient();
      const inngest = makeInngest();

      const prisma = makePrisma({
        execution: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'exec-old', runtime_id: 'machine-old' }]),
        } as unknown as PrismaClient['execution'],
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        } as unknown as PrismaClient['task'],
        taskStatusLog: {
          create: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['taskStatusLog'],
      });

      await runWatchdog(prisma, fly, inngest, slack);

      expect(fly.destroyMachine).toHaveBeenCalledWith('test-worker-app', 'machine-old');
    });

    it('does not throw when destroyMachine rejects (404 handling)', async () => {
      const fly = makeFlyClient();
      vi.mocked(fly.destroyMachine).mockRejectedValue(new Error('404 not found'));
      const slack = makeSlackClient();
      const inngest = makeInngest();

      const prisma = makePrisma({
        execution: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'exec-gone', runtime_id: 'machine-gone' }]),
        } as unknown as PrismaClient['execution'],
        task: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        } as unknown as PrismaClient['task'],
        taskStatusLog: {
          create: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['taskStatusLog'],
      });

      await expect(runWatchdog(prisma, fly, inngest, slack)).resolves.not.toThrow();
    });
  });

  describe('stuck Submitting task recovery', () => {
    it('emits engineering/task.completed with deterministic event ID', async () => {
      const taskId = 'task-stuck-sub';
      const execId = 'exec-sub-001';
      const fly = makeFlyClient();
      const slack = makeSlackClient();
      const inngest = makeInngest();

      const prisma = makePrisma({
        execution: {
          findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        } as unknown as PrismaClient['execution'],
        task: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: taskId,
              status: 'Submitting',
              executions: [{ id: execId, created_at: new Date() }],
            },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        } as unknown as PrismaClient['task'],
        taskStatusLog: {
          create: vi.fn().mockResolvedValue({}),
        } as unknown as PrismaClient['taskStatusLog'],
      });

      const result = await runWatchdog(prisma, fly, inngest, slack);

      expect(result.submittingRecovered).toBe(1);
      expect(inngest.send).toHaveBeenCalledWith({
        id: `task-${taskId}-completion-${execId}`,
        name: 'engineering/task.completed',
        data: { taskId, executionId: execId, prUrl: null },
      });
    });
  });
});
