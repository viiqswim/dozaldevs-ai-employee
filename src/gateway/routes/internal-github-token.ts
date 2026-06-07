import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import { generateInstallationToken } from '../services/github-token-manager.js';

const logger = createLogger('internal-github-token');

export interface InternalGithubTokenRouteOptions {
  prisma?: PrismaClient;
}

export function internalGithubTokenRoutes(opts: InternalGithubTokenRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const secretRepo = new TenantSecretRepository(prisma);

  router.post('/tasks/:taskId/github-token', async (req, res) => {
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

      if (task.status !== 'Executing') {
        res.status(403).json({ error: 'Task is not in Executing state' });
        return;
      }

      const tenantId = task.tenant_id;

      const installationIdStr = await secretRepo.get(tenantId, 'github_installation_id');
      if (!installationIdStr) {
        res.status(404).json({ error: 'GitHub not connected' });
        return;
      }

      const installationId = parseInt(installationIdStr, 10);
      const tokenResult = await generateInstallationToken(installationId);

      logger.info({ taskId, tenantId }, 'GitHub installation token generated for task');

      res.status(200).json({ token: tokenResult.token, expires_at: tokenResult.expires_at });
    } catch (err) {
      logger.error({ err, taskId }, 'Failed to generate GitHub installation token');
      res.status(500).json({ error: 'Failed to generate GitHub token' });
    }
  });

  return router;
}
