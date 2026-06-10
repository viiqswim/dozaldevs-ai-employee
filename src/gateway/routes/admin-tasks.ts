import { Router } from 'express';
import { PrismaClient, TenantRole } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { createReadStream, existsSync, statSync, watchFile, unwatchFile } from 'fs';
import { createInterface } from 'readline';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { GetTaskParamsSchema } from '../validation/schemas.js';
import { LOG_STREAM_TERMINAL_STATUSES } from '../../lib/task-status.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

const logger = createLogger('admin-tasks');

export interface AdminTasksRouteOptions {
  prisma?: PrismaClient;
}

export function adminTasksRoutes(opts: AdminTasksRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.get(
    '/admin/tenants/:tenantId/tasks/:id',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const paramsResult = GetTaskParamsSchema.safeParse({
        tenantId: req.params.tenantId,
        id: req.params.id,
      });

      if (!paramsResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: paramsResult.error.issues });
        return;
      }

      const { tenantId, id } = paramsResult.data;

      try {
        const task = await prisma.task.findFirst({
          where: { id, tenant_id: tenantId },
          select: {
            id: true,
            status: true,
            source_system: true,
            external_id: true,
            archetype_id: true,
            created_at: true,
            updated_at: true,
          },
        });

        if (!task) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        sendSuccess(res, 200, task);
      } catch (err) {
        logger.error({ err }, 'Failed to get task');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/tasks/:id/logs',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const paramsResult = GetTaskParamsSchema.safeParse({
        tenantId: req.params.tenantId,
        id: req.params.id,
      });

      if (!paramsResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: paramsResult.error.issues });
        return;
      }

      const { tenantId, id } = paramsResult.data;

      try {
        const task = await prisma.task.findFirst({
          where: { id, tenant_id: tenantId },
          select: { id: true, status: true },
        });

        if (!task) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        const logPath = `/tmp/employee-${id.slice(0, 8)}.log`;

        if (!existsSync(logPath)) {
          sendError(
            res,
            404,
            'LOG_NOT_FOUND',
            'No log file found for this task. The worker may not have started yet.',
          );
          return;
        }

        logger.info({ taskId: id }, 'SSE log stream opened');

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const sendLine = (line: string) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ line })}\n\n`);
          }
        };

        const sendDone = () => {
          if (!res.writableEnded) {
            res.write(`event: done\ndata: ${JSON.stringify({ reason: 'complete' })}\n\n`);
            res.end();
          }
        };

        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          unwatchFile(logPath);
          if (!res.writableEnded) res.end();
        };

        req.on('close', cleanup);

        const isTerminal = LOG_STREAM_TERMINAL_STATUSES.has(task.status);

        if (isTerminal) {
          const rl = createInterface({
            input: createReadStream(logPath),
            crlfDelay: Infinity,
          });

          rl.on('line', (line) => {
            sendLine(line);
          });

          rl.on('close', () => {
            sendDone();
            cleanup();
          });

          rl.on('error', (err) => {
            logger.error({ err, taskId: id }, 'Error reading log file for terminal task');
            sendDone();
            cleanup();
          });
        } else {
          let lastPos = 0;

          const readNewLines = (start: number, end: number, onDone: () => void) => {
            const stream = createReadStream(logPath, { start, end: end - 1 });
            const rl = createInterface({ input: stream, crlfDelay: Infinity });

            rl.on('line', (line) => {
              sendLine(line);
            });

            rl.on('close', onDone);
            rl.on('error', (err) => {
              logger.error({ err, taskId: id }, 'Error reading new log lines');
              onDone();
            });
          };

          const initialSize = statSync(logPath).size;
          if (initialSize > 0) {
            readNewLines(0, initialSize, () => {
              lastPos = initialSize;
              watchFile(logPath, { interval: 1000 }, (curr) => {
                if (res.writableEnded || cleaned) {
                  unwatchFile(logPath);
                  return;
                }
                const newSize = curr.size;
                if (newSize > lastPos) {
                  const prevPos = lastPos;
                  lastPos = newSize;
                  readNewLines(prevPos, newSize, () => {});
                }
              });
            });
          } else {
            lastPos = 0;
            watchFile(logPath, { interval: 1000 }, (curr) => {
              if (res.writableEnded || cleaned) {
                unwatchFile(logPath);
                return;
              }
              const newSize = curr.size;
              if (newSize > lastPos) {
                const prevPos = lastPos;
                lastPos = newSize;
                readNewLines(prevPos, newSize, () => {});
              }
            });
          }
        }
      } catch (err) {
        logger.error({ err }, 'Failed to open SSE log stream');
        if (!res.writableEnded) {
          sendError(res, 500, 'INTERNAL_ERROR');
        }
      }
    },
  );

  return router;
}
