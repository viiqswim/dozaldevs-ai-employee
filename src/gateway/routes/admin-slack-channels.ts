import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export interface AdminSlackChannelsRouteOptions {
  prisma?: PrismaClient;
}

export function adminSlackChannelsRoutes(opts: AdminSlackChannelsRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('admin-slack-channels');
  const prisma = opts.prisma ?? new PrismaClient();
  const secretRepo = new TenantSecretRepository(prisma);

  router.get('/admin/tenants/:tenantId/slack/channels', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }

    const { tenantId } = paramResult.data;

    let token: string | null;
    try {
      token = await secretRepo.get(tenantId, 'slack_bot_token');
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to read SLACK_BOT_TOKEN from tenant secrets');
      sendError(res, 500, 'INTERNAL_ERROR');
      return;
    }

    if (!token) {
      sendSuccess(res, 200, { channels: [], error: 'SLACK_NOT_CONFIGURED' });
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

      sendSuccess(res, 200, { channels });
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to list Slack channels');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
