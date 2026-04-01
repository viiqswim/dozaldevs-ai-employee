import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { InngestLike } from '../server.js';
import { verifyJiraSignature } from '../validation/signature.js';
import { parseJiraWebhook, parseJiraIssueDeletion } from '../validation/schemas.js';
import { lookupProjectByJiraKey } from '../services/project-lookup.js';
import { createTaskFromJiraWebhook, cancelTaskByExternalId } from '../services/task-creation.js';
import { sendTaskReceivedEvent } from '../inngest/send.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface JiraRouteOptions extends FastifyPluginOptions {
  inngestClient?: InngestLike;
  prisma?: PrismaClient;
}

export async function jiraRoutes(app: FastifyInstance, opts: JiraRouteOptions): Promise<void> {
  const prisma = opts.prisma ?? new PrismaClient();
  const inngest = opts.inngestClient;

  app.post('/webhooks/jira', { config: { rawBody: true } }, async (request, reply) => {
    const signatureHeader = request.headers['x-hub-signature'] as string | undefined;
    const rawBody =
      (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
    const secret = process.env.JIRA_WEBHOOK_SECRET!;

    if (!verifyJiraSignature(rawBody, signatureHeader, secret)) {
      request.log.warn({ url: '/webhooks/jira' }, 'Invalid Jira webhook signature');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    let payload: ReturnType<typeof parseJiraWebhook>;
    try {
      payload = parseJiraWebhook(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        request.log.warn({ issues: error.issues }, 'Invalid Jira webhook payload');
        return reply.status(400).send({ error: 'Invalid payload', details: error.issues });
      }
      throw error;
    }

    const { webhookEvent } = payload;

    if (webhookEvent === 'jira:issue_updated') {
      request.log.info({ webhookEvent }, 'Ignoring jira:issue_updated per §4.2');
      return reply.send({ received: true, action: 'ignored' });
    }

    if (webhookEvent === 'jira:issue_deleted') {
      let deletionPayload: ReturnType<typeof parseJiraIssueDeletion>;
      try {
        deletionPayload = parseJiraIssueDeletion(request.body);
      } catch {
        return reply.send({ received: true, action: 'ignored' });
      }

      const cancelled = await cancelTaskByExternalId({
        externalId: deletionPayload.issue.key,
        sourceSystem: 'jira',
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });

      return reply.send({
        received: true,
        action: cancelled ? 'cancelled' : 'not_found',
      });
    }

    if (webhookEvent !== 'jira:issue_created') {
      request.log.info({ webhookEvent }, 'Unknown Jira webhook event type — ignoring');
      return reply.send({ received: true, action: 'ignored' });
    }

    const jiraProjectKey = payload.issue.fields.project.key;
    const project = await lookupProjectByJiraKey(jiraProjectKey, SYSTEM_TENANT_ID, prisma);

    if (!project) {
      request.log.info({ jiraProjectKey }, 'Project not registered — ignoring webhook');
      return reply.send({ received: true, action: 'project_not_registered' });
    }

    const { task, created } = await createTaskFromJiraWebhook({
      payload,
      projectId: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    if (!created) {
      request.log.info({ taskId: task.id }, 'Duplicate webhook — task already exists');
      return reply.send({ received: true, action: 'duplicate' });
    }

    if (inngest) {
      const eventId = `jira-${payload.issue.key}-${Date.now()}`;
      const sendResult = await sendTaskReceivedEvent({
        inngest,
        taskId: task.id,
        projectId: project.id,
        repoUrl: project.repo_url ?? undefined,
        repoBranch: project.default_branch ?? 'main',
        eventId,
      });

      if (!sendResult.success) {
        request.log.warn(
          { taskId: task.id, error: sendResult.error },
          'Inngest send failed — task in Received for manual recovery',
        );
        return reply
          .status(202)
          .send({ received: true, action: 'queued_without_inngest', taskId: task.id });
      }
    }

    return reply.send({ received: true, action: 'task_created', taskId: task.id });
  });
}
