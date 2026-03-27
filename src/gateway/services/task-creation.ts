import type { PrismaClient, Task, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import type { JiraWebhookPayload } from '../validation/schemas.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface CreateTaskResult {
  task: Task;
  created: boolean; // false if task already existed (idempotent duplicate)
}

/**
 * Build the triage_result JSONB from a Jira webhook payload.
 * This is the interface contract between the gateway and the execution agent.
 */
function buildTriageResult(payload: JiraWebhookPayload): Record<string, unknown> {
  const { issue } = payload;
  return {
    ticket_id: issue.key,
    title: issue.fields.summary,
    description: issue.fields.description ?? null,
    labels: issue.fields.labels ?? [],
    priority: issue.fields.priority?.name ?? null,
    raw_ticket: issue,
  };
}

/**
 * Create a task record from a Jira webhook payload.
 * Uses a transaction to atomically create task + status log.
 * Handles duplicate webhook delivery idempotently (P2002 → returns existing task).
 */
export async function createTaskFromJiraWebhook(params: {
  payload: JiraWebhookPayload;
  projectId: string;
  tenantId: string;
  prisma: PrismaClient;
}): Promise<CreateTaskResult> {
  const { payload, projectId, tenantId, prisma } = params;

  try {
    let task: Task | undefined;

    await prisma.$transaction(async (tx) => {
      // Create task with status Ready (MVP bypasses triage)
      task = await tx.task.create({
        data: {
          external_id: payload.issue.key,
          source_system: 'jira',
          status: 'Ready',
          project_id: projectId,
          tenant_id: tenantId,
          raw_event: payload as unknown as Prisma.InputJsonValue,
          triage_result: buildTriageResult(payload) as unknown as Prisma.InputJsonValue,
        },
      });

      // Create status log entry (actor: gateway)
      await tx.taskStatusLog.create({
        data: {
          task_id: task.id,
          from_status: null,
          to_status: 'Ready',
          actor: 'gateway',
        },
      });
    });

    return { task: task!, created: true };
  } catch (error) {
    // P2002 = unique constraint violation (duplicate webhook)
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      // Task already exists — return existing task for idempotency
      const existingTask = await params.prisma.task.findFirst({
        where: {
          external_id: payload.issue.key,
          source_system: 'jira',
          tenant_id: params.tenantId,
        },
      });

      if (!existingTask) {
        throw error; // Unexpected — unique violation but task not found
      }

      return { task: existingTask, created: false };
    }
    throw error;
  }
}

/**
 * Cancel a task by its external ID.
 * Returns true if cancelled, false if not found or already terminal.
 */
export async function cancelTaskByExternalId(params: {
  externalId: string;
  sourceSystem: string;
  tenantId: string;
  prisma: PrismaClient;
}): Promise<boolean> {
  const { externalId, sourceSystem, tenantId, prisma } = params;

  const task = await prisma.task.findFirst({
    where: {
      external_id: externalId,
      source_system: sourceSystem,
      tenant_id: tenantId,
    },
  });

  if (!task) return false;

  // Terminal states — can't cancel
  const terminalStates = ['Done', 'Cancelled'];
  if (terminalStates.includes(task.status)) return false;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: { status: 'Cancelled' },
    });

    await tx.taskStatusLog.create({
      data: {
        task_id: task.id,
        from_status: task.status,
        to_status: 'Cancelled',
        actor: 'gateway',
      },
    });
  });

  return true;
}
