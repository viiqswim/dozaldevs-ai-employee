import { Router } from 'express';
import type { Request, Response } from 'express';
import pino from 'pino';
import { ZodError } from 'zod';
import { PrismaClient } from '@prisma/client';
import type { InngestLike } from '../types.js';
import { verifyJiraSignature } from '../validation/signature.js';
import { parseJiraWebhook, parseJiraIssueDeletion } from '../validation/schemas.js';
import { createTaskFromJiraWebhook, cancelTaskByExternalId } from '../services/task-creation.js';
import { sendTaskReceivedEvent } from '../inngest/send.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface JiraRouteOptions {
  inngestClient?: InngestLike;
  prisma?: PrismaClient;
}

export function jiraRoutes(opts: JiraRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const inngest = opts.inngestClient;
  const secretRepo = new TenantSecretRepository(prisma);

  router.post('/webhooks/jira', async (req: Request, res: Response) => {
    const signatureHeader = req.headers['x-hub-signature'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

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

    if (webhookEvent !== 'jira:issue_created' && webhookEvent !== 'jira:issue_deleted') {
      logger.info({ webhookEvent }, 'Unknown Jira webhook event type — ignoring');
      res.json({ received: true, action: 'ignored' });
      return;
    }

    let jiraProjectKey: string | undefined;
    if (webhookEvent === 'jira:issue_deleted') {
      try {
        const deletionPayload = parseJiraIssueDeletion(req.body);
        jiraProjectKey = deletionPayload.issue.fields?.project?.key as string | undefined;
      } catch {
        /* deletion payload missing project key — proceed without tenant resolution */
      }
    } else {
      jiraProjectKey = payload.issue.fields.project.key;
    }

    let tenantId: string | undefined;
    let project: {
      id: string;
      tenant_id: string;
      repo_url: string | null;
      default_branch: string | null;
    } | null = null;

    if (jiraProjectKey) {
      project = await prisma.project.findFirst({
        where: { jira_project_key: jiraProjectKey },
        select: { id: true, tenant_id: true, repo_url: true, default_branch: true },
      });

      if (!project) {
        logger.warn({ jiraProjectKey }, 'Jira webhook for unknown project');
        res.status(404).json({ error: 'Unknown Jira project' });
        return;
      }

      tenantId = project.tenant_id;
    }

    let secret: string | undefined;
    if (tenantId) {
      const tenantSecret = await secretRepo.get(tenantId, 'jira_webhook_secret');
      if (tenantSecret) {
        secret = tenantSecret;
      } else {
        secret = process.env.JIRA_WEBHOOK_SECRET;
        if (secret) {
          logger.warn(
            { tenant_id: tenantId, project_key: jiraProjectKey, fallback: 'platform_env' },
            'No tenant jira_webhook_secret — falling back to platform JIRA_WEBHOOK_SECRET',
          );
        }
      }
    } else {
      secret = process.env.JIRA_WEBHOOK_SECRET;
    }

    if (!secret) {
      logger.warn('No JIRA_WEBHOOK_SECRET available — rejecting webhook');
      res.status(401).json({ error: 'Webhook signing not configured' });
      return;
    }

    if (!verifyJiraSignature(rawBody, signatureHeader, secret)) {
      logger.warn({ url: '/webhooks/jira', tenant_id: tenantId }, 'Invalid Jira webhook signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
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

      if (!tenantId) {
        logger.warn(
          { issueKey: deletionPayload.issue.key },
          'Jira issue_deleted with no resolved tenantId — skipping cancellation',
        );
        res.json({ received: true, action: 'tenant_not_resolved' });
        return;
      }

      const cancelled = await cancelTaskByExternalId({
        externalId: deletionPayload.issue.key,
        sourceSystem: 'jira',
        tenantId,
        prisma,
      });

      res.json({
        received: true,
        action: cancelled ? 'cancelled' : 'not_found',
      });
      return;
    }

    if (!project) {
      res.status(404).json({ error: 'Unknown Jira project' });
      return;
    }

    const { task, created } = await createTaskFromJiraWebhook({
      payload,
      projectId: project.id,
      tenantId: project.tenant_id,
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
