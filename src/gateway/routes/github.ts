import { Router } from 'express';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export function githubRoutes(): Router {
  const router = Router();
  router.post('/webhooks/github', (_req, res) => {
    logger.info({ event: 'github_webhook_received_stub' }, 'GitHub webhook received (stub)');
    res.json({
      received: true,
      stub: true,
      message: 'GitHub webhook processing is not active in MVP. Active in M4.',
    });
  });
  return router;
}
