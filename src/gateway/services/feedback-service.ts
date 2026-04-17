import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('feedback-service');

export interface ThreadReplyFeedbackInput {
  taskId: string;
  feedbackText: string;
  userId: string;
  threadTs: string;
  channelId: string;
  tenantId: string;
}

export class FeedbackService {
  constructor(private readonly prisma: PrismaClient) {}

  async ingestThreadReply(data: ThreadReplyFeedbackInput): Promise<void> {
    const { taskId, feedbackText, userId, tenantId } = data;

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    if (!task) {
      log.warn({ taskId }, 'Task not found for feedback ingestion');
      return;
    }

    await this.prisma.feedback.create({
      data: {
        task_id: taskId,
        feedback_type: 'thread_reply',
        original_decision: Prisma.JsonNull,
        corrected_decision: Prisma.JsonNull,
        correction_reason: feedbackText,
        created_by: userId,
        tenant_id: tenantId,
      },
    });

    log.info({ taskId, userId }, 'Thread reply feedback ingested');
  }
}
