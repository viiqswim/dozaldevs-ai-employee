import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { FeedbackService } from '../../../src/gateway/services/feedback-service.js';

function makePrisma(overrides: Partial<PrismaClient> = {}): PrismaClient {
  return {
    task: {
      findUnique: vi.fn(),
    },
    feedback: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('FeedbackService', () => {
  let prisma: PrismaClient;
  let service: FeedbackService;

  const baseInput = {
    taskId: 'task-abc-123',
    feedbackText: 'Great work on the summary!',
    userId: 'U123456',
    threadTs: '1234567890.000100',
    channelId: 'C123456',
    tenantId: '00000000-0000-0000-0000-000000000001',
  };

  beforeEach(() => {
    prisma = makePrisma();
    service = new FeedbackService(prisma);
  });

  describe('ingestThreadReply', () => {
    it('creates a feedback record when task exists', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task-abc-123' } as never);

      await service.ingestThreadReply(baseInput);

      expect(prisma.feedback.create).toHaveBeenCalledWith({
        data: {
          task_id: 'task-abc-123',
          feedback_type: 'thread_reply',
          original_decision: Prisma.JsonNull,
          corrected_decision: Prisma.JsonNull,
          correction_reason: 'Great work on the summary!',
          created_by: 'U123456',
          tenant_id: '00000000-0000-0000-0000-000000000001',
        },
      });
    });

    it('does nothing when task is not found', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue(null);

      await service.ingestThreadReply(baseInput);

      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('queries task by taskId', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task-abc-123' } as never);

      await service.ingestThreadReply(baseInput);

      expect(prisma.task.findUnique).toHaveBeenCalledWith({
        where: { id: 'task-abc-123' },
        select: { id: true },
      });
    });

    it('uses feedbackText as correction_reason', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task-abc-123' } as never);
      const input = { ...baseInput, feedbackText: 'Please fix the formatting' };

      await service.ingestThreadReply(input);

      const call = vi.mocked(prisma.feedback.create).mock.calls[0][0];
      expect(call.data.correction_reason).toBe('Please fix the formatting');
    });

    it('uses tenantId from input', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task-abc-123' } as never);
      const input = { ...baseInput, tenantId: '00000000-0000-0000-0000-000000000002' };

      await service.ingestThreadReply(input);

      const call = vi.mocked(prisma.feedback.create).mock.calls[0][0];
      expect(call.data.tenant_id).toBe('00000000-0000-0000-0000-000000000002');
    });

    it('sets feedback_type to thread_reply', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task-abc-123' } as never);

      await service.ingestThreadReply(baseInput);

      const call = vi.mocked(prisma.feedback.create).mock.calls[0][0];
      expect(call.data.feedback_type).toBe('thread_reply');
    });

    it('sets original_decision and corrected_decision to JsonNull', async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({ id: 'task-abc-123' } as never);

      await service.ingestThreadReply(baseInput);

      const call = vi.mocked(prisma.feedback.create).mock.calls[0][0];
      expect(call.data.original_decision).toBe(Prisma.JsonNull);
      expect(call.data.corrected_decision).toBe(Prisma.JsonNull);
    });
  });
});
