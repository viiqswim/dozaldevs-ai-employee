import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface GitHubWebhookRouteOptions {
  prisma?: PrismaClient;
}

function verifyGitHubSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function githubRoutes(opts: GitHubWebhookRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const integrationRepo = new TenantIntegrationRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);

  router.post('/webhooks/github', async (req: Request, res: Response) => {
    const githubEvent = req.headers['x-github-event'] as string | undefined;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn(
        { event: githubEvent },
        'GITHUB_WEBHOOK_SECRET not configured — rejecting webhook',
      );
      res.status(401).json({ error: 'Webhook signing not configured' });
      return;
    }

    if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
      logger.warn({ event: githubEvent }, 'Invalid GitHub webhook signature');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    if (githubEvent !== 'installation') {
      logger.info({ event: githubEvent }, 'GitHub webhook received — no-op');
      res.json({ received: true, action: 'ignored' });
      return;
    }

    const action = req.body?.action as string | undefined;
    const installationId = String(req.body?.installation?.id ?? '');

    logger.info(
      { event: githubEvent, action, installationId },
      'GitHub installation webhook received',
    );

    if (action === 'deleted') {
      const integrations = await integrationRepo.findManyByExternalId('github', installationId);
      if (integrations.length === 0) {
        logger.info(
          { installationId },
          'GitHub installation.deleted — unknown installation_id, no-op',
        );
        res.json({ received: true, action: 'unknown_installation' });
        return;
      }

      let tenantsCleanedCount = 0;
      for (const integration of integrations) {
        const { tenant_id: tenantId } = integration;
        try {
          await integrationRepo.delete(tenantId, 'github');
          await secretRepo.delete(tenantId, 'github_installation_id');
          logger.info(
            { tenantId, installationId },
            'GitHub App uninstalled — integration and secret removed',
          );
          tenantsCleanedCount++;
        } catch (err) {
          logger.error(
            { tenantId, installationId, err },
            'GitHub installation.deleted — failed to clean up tenant, continuing',
          );
        }
      }

      res.json({ received: true, action: 'deleted', tenants_cleaned: tenantsCleanedCount });
      return;
    }

    if (action === 'created') {
      // The Setup URL callback (GET /integrations/github/callback) is the primary path for
      // associating installation → tenant via the HMAC-signed state parameter.
      // The webhook payload does not carry tenant context, so we cannot associate here.
      logger.info(
        { installationId },
        'GitHub installation.created webhook — tenant association handled via Setup URL callback',
      );
      res.json({ received: true, action: 'ignored_handled_by_callback' });
      return;
    }

    logger.info(
      { event: githubEvent, action, installationId },
      'GitHub installation webhook — unhandled action, no-op',
    );
    res.json({ received: true, action: 'ignored' });
  });

  return router;
}
