import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskRepository } from '../../../src/repositories/task-repository.js';

function makePrisma() {
  return {
    task: {
      findFirst: vi.fn(),
    },
    deliverable: {
      findFirst: vi.fn(),
    },
    pendingApproval: {
      findFirst: vi.fn(),
    },
  };
}

describe('TaskRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: TaskRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new TaskRepository(prisma as never);
  });

  describe('findById', () => {
    it('returns the task when found', async () => {
      const task = { id: 'task-1', status: 'Reviewing' };
      prisma.task.findFirst.mockResolvedValue(task);

      const result = await repo.findById('task-1');

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 'task-1' },
      });
      expect(result).toBe(task);
    });

    it('returns null when not found', async () => {
      prisma.task.findFirst.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findIdByThreadTs', () => {
    it('returns external_ref from deliverable when approval_message_ts matches', async () => {
      prisma.deliverable.findFirst.mockResolvedValue({ external_ref: 'task-from-deliv' });

      const result = await repo.findIdByThreadTs('1234567890.123');

      expect(prisma.deliverable.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metadata: { path: ['approval_message_ts'], equals: '1234567890.123' },
          }),
          select: { external_ref: true },
        }),
      );
      expect(result).toBe('task-from-deliv');
    });

    it('falls back to task metadata when deliverable has no external_ref', async () => {
      prisma.deliverable.findFirst.mockResolvedValue({ external_ref: null });
      prisma.task.findFirst.mockResolvedValue({ id: 'task-from-notify' });

      const result = await repo.findIdByThreadTs('1234567890.456');

      expect(prisma.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            metadata: { path: ['notify_slack_ts'], equals: '1234567890.456' },
          }),
          select: { id: true },
        }),
      );
      expect(result).toBe('task-from-notify');
    });

    it('falls back to task metadata when deliverable is null', async () => {
      prisma.deliverable.findFirst.mockResolvedValue(null);
      prisma.task.findFirst.mockResolvedValue({ id: 'task-2' });

      const result = await repo.findIdByThreadTs('ts-1');

      expect(result).toBe('task-2');
    });

    it('returns null when neither deliverable nor task found', async () => {
      prisma.deliverable.findFirst.mockResolvedValue(null);
      prisma.task.findFirst.mockResolvedValue(null);

      expect(await repo.findIdByThreadTs('unknown-ts')).toBeNull();
    });
  });

  describe('findByApprovalTs', () => {
    it('returns taskId when pending approval found', async () => {
      prisma.pendingApproval.findFirst.mockResolvedValue({ task_id: 'task-abc' });

      const result = await repo.findByApprovalTs('approval-ts-1');

      expect(prisma.pendingApproval.findFirst).toHaveBeenCalledWith({
        where: { slack_ts: 'approval-ts-1' },
        select: { task_id: true },
      });
      expect(result).toEqual({ taskId: 'task-abc' });
    });

    it('returns null when no pending approval found', async () => {
      prisma.pendingApproval.findFirst.mockResolvedValue(null);
      expect(await repo.findByApprovalTs('no-such-ts')).toBeNull();
    });
  });

  describe('getStatusMessage', () => {
    it.each([
      ['Done', '✅ Already approved and delivered — nothing left to do here.'],
      [
        'Cancelled',
        '⏭️ This task is no longer active — it may have been superseded by a newer message.',
      ],
      ['Failed', '❌ This one ran into a problem — it has already been marked as failed.'],
    ])('returns correct message for status %s', async (status, expected) => {
      prisma.task.findFirst.mockResolvedValue({ status });
      expect(await repo.getStatusMessage('task-1')).toBe(expected);
    });

    it('returns generic fallback for unknown status', async () => {
      prisma.task.findFirst.mockResolvedValue({ status: 'Reviewing' });
      expect(await repo.getStatusMessage('task-1')).toBe(
        'Looks like this one has already been handled.',
      );
    });

    it('returns generic fallback when task not found', async () => {
      prisma.task.findFirst.mockResolvedValue(null);
      expect(await repo.getStatusMessage('missing')).toBe(
        'Looks like this one has already been handled.',
      );
    });
  });
});
