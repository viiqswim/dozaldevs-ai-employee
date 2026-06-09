/**
 * Read-only task data-access repository.
 *
 * Location rationale: Uses Prisma; consumed by both `src/inngest/` and
 * `src/gateway/`. Lives in `src/repositories/` so each layer can import it
 * without crossing architectural boundaries. Worker containers MUST NOT
 * import this module — they use PostgREST.
 *
 * ZERO WRITE METHODS — tasks are created and mutated exclusively by the
 * Inngest lifecycle (`src/inngest/employee-lifecycle.ts`).
 */
import type { PrismaClient, Task } from '@prisma/client';

export class TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(taskId: string): Promise<Task | null> {
    return this.prisma.task.findFirst({
      where: { id: taskId },
    });
  }

  async findIdByThreadTs(threadTs: string): Promise<string | null> {
    // Check deliverables by approval_message_ts in metadata (approval card TS)
    const deliverable = await this.prisma.deliverable.findFirst({
      where: {
        metadata: {
          path: ['approval_message_ts'],
          equals: threadTs,
        },
      },
      select: { external_ref: true },
    });
    if (deliverable?.external_ref) return deliverable.external_ref;

    // Fallback: check tasks by notify_slack_ts in metadata (parent message TS)
    const task = await this.prisma.task.findFirst({
      where: {
        metadata: {
          path: ['notify_slack_ts'],
          equals: threadTs,
        },
      },
      select: { id: true },
    });
    return task?.id ?? null;
  }

  async findByApprovalTs(approvalTs: string): Promise<{ taskId: string } | null> {
    const pa = await this.prisma.pendingApproval.findFirst({
      where: { slack_ts: approvalTs },
      select: { task_id: true },
    });
    if (!pa) return null;
    return { taskId: pa.task_id };
  }

  async getStatusMessage(taskId: string): Promise<string> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId },
      select: { status: true },
    });
    const status = task?.status;
    if (status === 'Done') return '✅ Already approved and delivered — nothing left to do here.';
    if (status === 'Cancelled')
      return '⏭️ This task is no longer active — it may have been superseded by a newer message.';
    if (status === 'Failed')
      return '❌ This one ran into a problem — it has already been marked as failed.';
    return 'Looks like this one has already been handled.';
  }
}
