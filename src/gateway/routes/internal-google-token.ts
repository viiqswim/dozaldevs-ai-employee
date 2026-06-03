import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import {
  getGoogleAccessToken,
  GoogleNotConnectedError,
  GoogleReauthRequiredError,
  GoogleWorkspaceSessionExpiredError,
} from '../services/google-token-manager.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface InternalGoogleTokenRouteOptions {
  prisma?: PrismaClient;
}

export function internalGoogleTokenRoutes(opts: InternalGoogleTokenRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.post('/tasks/:taskId/google-token', async (req, res) => {
    const { taskId } = req.params;
    const headerTaskId = req.headers['x-task-id'];

    if (!headerTaskId || headerTaskId !== taskId) {
      res.status(400).json({ error: 'X-Task-ID header missing or does not match task ID' });
      return;
    }

    try {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      if (task.status !== 'Executing' && task.status !== 'Delivering') {
        res.status(403).json({ error: 'Task is not in Executing or Delivering state' });
        return;
      }

      const tokenResult = await getGoogleAccessToken(task.tenant_id, prisma);

      logger.info({ taskId, tenantId: task.tenant_id }, 'Google access token retrieved for task');

      res.status(200).json({
        token: tokenResult.token,
        expires_at: tokenResult.expires_at,
        granted_scopes: tokenResult.granted_scopes,
      });
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) {
        res.status(404).json({
          error: 'google_not_connected',
          message:
            'Google is not connected for this tenant. Ask the admin to connect Google in the dashboard.',
        });
        return;
      }
      if (err instanceof GoogleReauthRequiredError) {
        res.status(401).json({
          error: 'google_reauth_required',
          message:
            'Google authorization has expired or been revoked. Ask the admin to reconnect Google.',
        });
        return;
      }
      if (err instanceof GoogleWorkspaceSessionExpiredError) {
        res.status(401).json({
          error: 'google_workspace_session_expired',
          message: 'Google Workspace session policy requires re-authentication.',
        });
        return;
      }
      logger.error({ err, taskId }, 'Failed to get Google access token');
      res.status(500).json({ error: 'Failed to get Google token' });
    }
  });

  return router;
}
