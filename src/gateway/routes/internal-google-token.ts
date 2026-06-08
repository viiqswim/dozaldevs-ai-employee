import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import {
  getGoogleAccessToken,
  GoogleNotConnectedError,
  GoogleReauthRequiredError,
  GoogleWorkspaceSessionExpiredError,
} from '../services/google-token-manager.js';
import { sendError } from '../lib/http-response.js';

const logger = createLogger('internal-google-token');

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
      sendError(res, 400, 'X-Task-ID header missing or does not match task ID');
      return;
    }

    try {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) {
        sendError(res, 404, 'Task not found');
        return;
      }

      if (task.status !== 'Executing' && task.status !== 'Delivering') {
        sendError(res, 403, 'Task is not in Executing or Delivering state');
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
        sendError(
          res,
          404,
          'google_not_connected',
          'Google is not connected for this tenant. Ask the admin to connect Google in the dashboard.',
        );
        return;
      }
      if (err instanceof GoogleReauthRequiredError) {
        sendError(
          res,
          401,
          'google_reauth_required',
          'Google authorization has expired or been revoked. Ask the admin to reconnect Google.',
        );
        return;
      }
      if (err instanceof GoogleWorkspaceSessionExpiredError) {
        sendError(
          res,
          401,
          'google_workspace_session_expired',
          'Google Workspace session policy requires re-authentication.',
        );
        return;
      }
      logger.error({ err, taskId }, 'Failed to get Google access token');
      sendError(res, 500, 'Failed to get Google token');
    }
  });

  return router;
}
