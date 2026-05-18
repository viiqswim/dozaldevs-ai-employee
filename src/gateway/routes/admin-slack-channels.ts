import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';

export interface AdminSlackChannelsRouteOptions {
  prisma?: PrismaClient;
}

export function adminSlackChannelsRoutes(opts: AdminSlackChannelsRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const secretRepo = new TenantSecretRepository(prisma);

  router.get('/admin/tenants/:tenantId/slack/channels', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const { tenantId } = paramResult.data;

    let token: string | null;
    try {
      token = await secretRepo.get(tenantId, 'slack_bot_token');
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to read SLACK_BOT_TOKEN from tenant secrets');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
      return;
    }

    if (!token) {
      res.status(200).json({ channels: [], error: 'SLACK_NOT_CONFIGURED' });
      return;
    }

    try {
      const client = new WebClient(token);
      const response = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
      });

      const channels = (response.channels ?? []).map((ch) => ({
        id: ch.id ?? '',
        name: ch.name ?? '',
        is_private: ch.is_private ?? false,
      }));

      res.status(200).json({ channels });
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to list Slack channels');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
