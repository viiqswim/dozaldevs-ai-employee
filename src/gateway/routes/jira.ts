import { Router } from 'express';
import type { Request, Response } from 'express';
import pino from 'pino';
import { ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { InngestLike } from '../types.js';
import { verifyJiraSignature } from '../validation/signature.js';
import { parseJiraWebhook, parseJiraIssueDeletion } from '../validation/schemas.js';
import { lookupProjectByJiraKey } from '../services/project-lookup.js';
import { createTaskFromJiraWebhook, cancelTaskByExternalId } from '../services/task-creation.js';
import { sendTaskReceivedEvent } from '../inngest/send.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface JiraRouteOptions {
  inngestClient?: InngestLike;
  prisma?: PrismaClient;
}

export function jiraRoutes(opts: JiraRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const inngest = opts.inngestClient;

  router.post('/webhooks/jira', async (req: Request, res: Response) => {
    const signatureHeader = req.headers['x-hub-signature'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
    const secret = process.env.JIRA_WEBHOOK_SECRET;

    if (!secret) {
      logger.warn('JIRA_WEBHOOK_SECRET not set — skipping signature verification');
      res.status(401).json({ error: 'Webhook signing not configured' });
      return;
    }

    if (!verifyJiraSignature(rawBody, signatureHeader, secret)) {
      logger.warn({ url: '/webhooks/jira' }, 'Invalid Jira webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let payload: ReturnType<typeof parseJiraWebhook>;
    try {
      payload = parseJiraWebhook(req.body);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({ issues: error.issues }, 'Invalid Jira webhook payload');
        res.status(400).json({ error: 'Invalid payload', details: error.issues });
        return;
      }
      throw error;
    }

    const { webhookEvent } = payload;

    if (webhookEvent === 'jira:issue_updated') {
      logger.info({ webhookEvent }, 'Ignoring jira:issue_updated per §4.2');
      res.json({ received: true, action: 'ignored' });
      return;
    }

    if (webhookEvent === 'jira:issue_deleted') {
      let deletionPayload: ReturnType<typeof parseJiraIssueDeletion>;
      try {
        deletionPayload = parseJiraIssueDeletion(req.body);
      } catch {
        res.json({ received: true, action: 'ignored' });
        return;
      }

      const cancelled = await cancelTaskByExternalId({
        externalId: deletionPayload.issue.key,
        sourceSystem: 'jira',
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });

      res.json({
        received: true,
        action: cancelled ? 'cancelled' : 'not_found',
      });
      return;
    }

    if (webhookEvent !== 'jira:issue_created') {
      logger.info({ webhookEvent }, 'Unknown Jira webhook event type — ignoring');
      res.json({ received: true, action: 'ignored' });
      return;
    }

    const jiraProjectKey = payload.issue.fields.project.key;
    const project = await lookupProjectByJiraKey(jiraProjectKey, SYSTEM_TENANT_ID, prisma);

    if (!project) {
      logger.info({ jiraProjectKey }, 'Project not registered — ignoring webhook');
      res.json({ received: true, action: 'project_not_registered' });
      return;
    }

    const { task, created } = await createTaskFromJiraWebhook({
      payload,
      projectId: project.id,
      tenantId: SYSTEM_TENANT_ID,
      prisma,
    });

    if (!created) {
      logger.info({ taskId: task.id }, 'Duplicate webhook — task already exists');
      res.json({ received: true, action: 'duplicate' });
      return;
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
        logger.warn(
          { taskId: task.id, error: sendResult.error },
          'Inngest send failed — task in Received for manual recovery',
        );
        res.status(202).json({ received: true, action: 'queued_without_inngest', taskId: task.id });
        return;
      }
    }

    res.json({ received: true, action: 'task_created', taskId: task.id });
  });

  return router;
}
